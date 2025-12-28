/**
 * OperationManager - tracks async module operations and bridges to SSE
 */

import { DependencyResolver } from "../core/dependencies";
import { allSucceeded, TaskExecutor, type TaskResult } from "../core/executor";
import { loadAllModules, loadModule } from "../core/module-loader";
import { StateManager } from "../core/state-manager";
import { StatusChecker } from "../core/status";
import { getPluginRegistry } from "../plugins/registry";
import { formatSSEMessage, type SSEEvent } from "../types/events";
import type { Task } from "../types/module";
import type { Operation } from "../types/plugin";
import { getLogger } from "./middleware";
import type { OperationStatus } from "./types";

// =============================================================================
// Types
// =============================================================================

export interface TrackedOperation {
	id: string;
	module: string;
	operation: Operation;
	status: OperationStatus;
	startedAt: Date;
	completedAt?: Date;
	results?: TaskResult[];
	error?: string;
	subscribers: Set<ReadableStreamDefaultController<Uint8Array>>;
}

export interface OperationManagerOptions {
	maxConcurrent?: number;
	operationTimeout?: number; // ms, default 5 minutes
}

// =============================================================================
// OperationManager
// =============================================================================

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_OPERATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const OPERATION_CLEANUP_AGE = 60 * 60 * 1000; // 1 hour

let instance: OperationManager | null = null;

export class OperationManager {
	private operations = new Map<string, TrackedOperation>();
	private moduleOperations = new Map<string, string>(); // module -> operationId
	private runningCount = 0;
	private maxConcurrent: number;
	private operationTimeout: number;
	private cleanupTimer?: Timer;

	private constructor(options: OperationManagerOptions = {}) {
		this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
		this.operationTimeout = options.operationTimeout ?? DEFAULT_OPERATION_TIMEOUT;

		// Start cleanup timer
		this.cleanupTimer = setInterval(() => this.cleanup(), OPERATION_CLEANUP_AGE / 2);
	}

	/**
	 * Get the singleton instance
	 */
	static getInstance(options?: OperationManagerOptions): OperationManager {
		if (!instance) {
			instance = new OperationManager(options);
		}
		return instance;
	}

	/**
	 * Reset the singleton (for testing)
	 */
	static resetInstance(): void {
		if (instance) {
			if (instance.cleanupTimer) {
				clearInterval(instance.cleanupTimer);
			}
			instance = null;
		}
	}

	/**
	 * Create and start a new operation
	 */
	async createOperation(module: string, operation: Operation): Promise<TrackedOperation> {
		const logger = getLogger();

		// Generate operation ID
		const id = crypto.randomUUID();

		// Create tracked operation
		const tracked: TrackedOperation = {
			id,
			module,
			operation,
			status: "queued",
			startedAt: new Date(),
			subscribers: new Set(),
		};

		this.operations.set(id, tracked);
		this.moduleOperations.set(module.toLowerCase(), id);

		logger.info({ operationId: id, module, operation }, "Operation created");

		// Start execution asynchronously
		this.executeOperation(tracked);

		return tracked;
	}

	/**
	 * Get operation by ID
	 */
	getOperation(id: string): TrackedOperation | undefined {
		return this.operations.get(id);
	}

	/**
	 * Check if module has an operation in progress
	 */
	hasOperationInProgress(module: string): boolean {
		const operationId = this.moduleOperations.get(module.toLowerCase());
		if (!operationId) return false;

		const operation = this.operations.get(operationId);
		if (!operation) return false;

		return operation.status === "queued" || operation.status === "running";
	}

	/**
	 * Subscribe to operation events
	 */
	subscribe(operationId: string, controller: ReadableStreamDefaultController<Uint8Array>): boolean {
		const operation = this.operations.get(operationId);
		if (!operation) return false;

		operation.subscribers.add(controller);
		return true;
	}

	/**
	 * Unsubscribe from operation events
	 */
	unsubscribe(operationId: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
		const operation = this.operations.get(operationId);
		if (operation) {
			operation.subscribers.delete(controller);
		}
	}

	/**
	 * Broadcast SSE event to all subscribers
	 */
	broadcast(operationId: string, event: SSEEvent): void {
		const operation = this.operations.get(operationId);
		if (!operation) return;

		const message = formatSSEMessage(event);
		const encoder = new TextEncoder();
		const data = encoder.encode(message);

		for (const controller of operation.subscribers) {
			try {
				controller.enqueue(data);
			} catch {
				// Controller closed, will be cleaned up
				operation.subscribers.delete(controller);
			}
		}
	}

	/**
	 * Close all subscriber connections for an operation
	 */
	closeSubscribers(operationId: string): void {
		const operation = this.operations.get(operationId);
		if (!operation) return;

		for (const controller of operation.subscribers) {
			try {
				controller.close();
			} catch {
				// Already closed
			}
		}
		operation.subscribers.clear();
	}

	/**
	 * Execute an operation
	 */
	private async executeOperation(tracked: TrackedOperation): Promise<void> {
		const logger = getLogger();

		// Wait for concurrency slot
		while (this.runningCount >= this.maxConcurrent) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		this.runningCount++;
		tracked.status = "running";

		// Set timeout
		const timeoutHandle = setTimeout(() => {
			if (tracked.status === "running") {
				this.failOperation(tracked, "Operation timed out");
			}
		}, this.operationTimeout);

		try {
			logger.info({ operationId: tracked.id, module: tracked.module }, "Operation starting");

			if (tracked.operation === "install") {
				await this.executeInstall(tracked);
			} else {
				await this.executeSingleOperation(tracked);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.failOperation(tracked, message);
		} finally {
			clearTimeout(timeoutHandle);
			this.runningCount--;
		}
	}

	/**
	 * Execute install operation with dependency resolution
	 */
	private async executeInstall(tracked: TrackedOperation): Promise<void> {
		// Load all modules for dependency resolution
		const allModulesResult = await loadAllModules();
		const resolver = new DependencyResolver(allModulesResult.modules);

		// Resolve installation order
		const resolution = resolver.getInstallOrder(tracked.module);
		if (!resolution.success) {
			const errorMsg = resolution.errors.map((e) => e.message).join("; ");
			this.failOperation(tracked, `Dependency error: ${errorMsg}`);
			return;
		}

		// Install dependencies first
		const statusChecker = new StatusChecker();
		for (const depName of resolution.order) {
			if (depName.toLowerCase() === tracked.module.toLowerCase()) continue;

			// Check if already installed
			const depModule = allModulesResult.modules.find(
				(m) => m.name.toLowerCase() === depName.toLowerCase(),
			);
			if (depModule) {
				const status = await statusChecker.checkStatus(depModule);
				if (status.installed) {
					this.broadcast(tracked.id, {
						type: "log",
						level: "info",
						message: `Dependency ${depName} already installed, skipping`,
						timestamp: new Date().toISOString(),
					});
					continue;
				}
			}

			// Install dependency
			this.broadcast(tracked.id, {
				type: "log",
				level: "info",
				message: `Installing dependency: ${depName}`,
				timestamp: new Date().toISOString(),
			});

			const success = await this.installModule(depName, tracked);
			if (!success) {
				this.failOperation(tracked, `Failed to install dependency: ${depName}`);
				return;
			}
		}

		// Install the main module
		const success = await this.installModule(tracked.module, tracked);
		if (success) {
			this.completeOperation(tracked);
		}
	}

	/**
	 * Install a single module and broadcast progress
	 */
	private async installModule(moduleName: string, tracked: TrackedOperation): Promise<boolean> {
		return this.executeModuleTasks(moduleName, "install", tracked);
	}

	/**
	 * Execute a single operation (remove/start/stop)
	 */
	private async executeSingleOperation(tracked: TrackedOperation): Promise<void> {
		const success = await this.executeModuleTasks(tracked.module, tracked.operation, tracked);
		if (success) {
			this.completeOperation(tracked);
		}
	}

	/**
	 * Execute tasks for a module and broadcast progress
	 */
	private async executeModuleTasks(
		moduleName: string,
		operation: Operation,
		tracked: TrackedOperation,
	): Promise<boolean> {
		const result = await loadModule(moduleName);
		if (!result.success || !result.module) {
			this.broadcast(tracked.id, {
				type: "error",
				message: `Module not found: ${moduleName}`,
			});
			return false;
		}

		const mod = result.module;
		const tasks = mod[operation] as Task[] | undefined;

		if (!tasks || tasks.length === 0) {
			this.broadcast(tracked.id, {
				type: "log",
				level: "info",
				message: `Module ${moduleName} has no ${operation} tasks`,
				timestamp: new Date().toISOString(),
			});
			return true;
		}

		// Load plugins
		const registry = getPluginRegistry();
		await registry.loadBuiltinPlugins();

		// Create executor
		const executor = new TaskExecutor({ dryRun: false });

		// Bridge TaskExecutor events to SSE
		executor.on("task:start", (task, index, total) => {
			const taskName = task.name ?? `Task ${index + 1}`;
			this.broadcast(tracked.id, {
				type: "progress",
				task: taskName,
				current: index + 1,
				total,
			});
		});

		executor.on("task:complete", (task, taskResult, _index, _total) => {
			const taskName = task.name ?? "Task";
			if (!taskResult.success) {
				this.broadcast(tracked.id, {
					type: "log",
					level: "error",
					message: taskResult.message ?? `${taskName} failed`,
					timestamp: new Date().toISOString(),
				});
			} else if (taskResult.changed) {
				this.broadcast(tracked.id, {
					type: "log",
					level: "info",
					message: `${taskName}: changed`,
					timestamp: new Date().toISOString(),
				});
			}
		});

		executor.on("task:error", (task, error, _index, _total) => {
			this.broadcast(tracked.id, {
				type: "error",
				message: error.message,
				task: task.name ?? "unknown",
			});
		});

		executor.on("log", (level, message) => {
			this.broadcast(tracked.id, {
				type: "log",
				level: level as "debug" | "info" | "warn" | "error",
				message,
				timestamp: new Date().toISOString(),
			});
		});

		// Execute tasks
		const results = await executor.execute(tasks, operation);
		const success = allSucceeded(results);

		// Update state on success
		if (success) {
			const stateManager = StateManager.getInstance();
			if (operation === "install") {
				await stateManager.installModule(moduleName);
			} else if (operation === "remove") {
				await stateManager.removeModule(moduleName);
			}
		}

		// Store results
		if (moduleName.toLowerCase() === tracked.module.toLowerCase()) {
			tracked.results = results;
		}

		if (!success) {
			const failures = results.filter((r) => !r.result.success);
			const errorMsg = failures.map((f) => f.result.message).join("; ");
			this.broadcast(tracked.id, {
				type: "error",
				message: `${operation} failed: ${errorMsg}`,
			});
			this.failOperation(tracked, errorMsg);
		}

		return success;
	}

	/**
	 * Mark operation as completed
	 */
	private completeOperation(tracked: TrackedOperation): void {
		const logger = getLogger();
		tracked.status = "completed";
		tracked.completedAt = new Date();

		const duration = tracked.completedAt.getTime() - tracked.startedAt.getTime();

		logger.info(
			{ operationId: tracked.id, module: tracked.module, duration },
			"Operation completed",
		);

		this.broadcast(tracked.id, {
			type: "complete",
			module: tracked.module,
			operation: tracked.operation,
			success: true,
			duration,
		});

		// Close subscribers after a short delay to ensure they receive the complete event
		setTimeout(() => this.closeSubscribers(tracked.id), 100);
	}

	/**
	 * Mark operation as failed
	 */
	private failOperation(tracked: TrackedOperation, error: string): void {
		const logger = getLogger();
		tracked.status = "failed";
		tracked.completedAt = new Date();
		tracked.error = error;

		const duration = tracked.completedAt.getTime() - tracked.startedAt.getTime();

		logger.error({ operationId: tracked.id, module: tracked.module, error }, "Operation failed");

		this.broadcast(tracked.id, {
			type: "complete",
			module: tracked.module,
			operation: tracked.operation,
			success: false,
			duration,
		});

		// Close subscribers after a short delay
		setTimeout(() => this.closeSubscribers(tracked.id), 100);
	}

	/**
	 * Clean up old completed operations
	 */
	cleanup(maxAge = OPERATION_CLEANUP_AGE): void {
		const now = Date.now();

		for (const [id, operation] of this.operations) {
			if (operation.status === "completed" || operation.status === "failed") {
				if (operation.completedAt && now - operation.completedAt.getTime() > maxAge) {
					this.operations.delete(id);
					this.moduleOperations.delete(operation.module.toLowerCase());
				}
			}
		}
	}
}
