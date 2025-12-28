/**
 * Task executor for running module task lists.
 * Executes tasks sequentially using registered plugins with EventEmitter for progress.
 */

import { EventEmitter } from "events";
import { getPluginRegistry } from "../plugins/registry";
import type { Task } from "../types/module";
import type { ExecutionContext, Logger, Operation, PluginResult } from "../types/plugin";
import { isMockMode } from "./mock-state";

// =============================================================================
// Types
// =============================================================================

export interface TaskResult {
	task: Task;
	result: PluginResult;
	duration: number;
}

export interface ExecutorOptions {
	/** Override mock mode (defaults to KATANA_MOCK env) */
	mock?: boolean;
	/** Enable dry-run mode */
	dryRun?: boolean;
	/** Custom logger */
	logger?: Logger;
	/** Stop execution on first failure (default: true) */
	stopOnError?: boolean;
}

export interface ExecutorEvents {
	"task:start": [task: Task, index: number, total: number];
	"task:complete": [task: Task, result: PluginResult, index: number, total: number];
	"task:error": [task: Task, error: Error, index: number, total: number];
	"execution:start": [tasks: Task[], operation: Operation];
	"execution:complete": [results: TaskResult[]];
	log: [level: string, message: string];
}

// Known plugin keys that can appear in tasks
const PLUGIN_KEYS = [
	"docker",
	"service",
	"lineinfile",
	"reverseproxy",
	"file",
	"copy",
	"git",
	"command",
	"rm",
	"get_url",
	"unarchive",
	"replace",
	"desktop",
] as const;

// =============================================================================
// TaskExecutor Class
// =============================================================================

/**
 * Executes task lists from module YAML files.
 * Uses registered plugins to handle each task type.
 */
export class TaskExecutor extends EventEmitter<ExecutorEvents> {
	private baseContext: Omit<ExecutionContext, "operation">;
	private stopOnError: boolean;

	constructor(options: ExecutorOptions = {}) {
		super();

		this.stopOnError = options.stopOnError ?? true;
		this.baseContext = {
			mock: options.mock ?? isMockMode(),
			dryRun: options.dryRun ?? false,
			logger: options.logger ?? this.createDefaultLogger(),
		};
	}

	/**
	 * Create default logger that emits log events
	 */
	private createDefaultLogger(): Logger {
		return {
			debug: (msg: string) => this.emit("log", "debug", msg),
			info: (msg: string) => this.emit("log", "info", msg),
			warn: (msg: string) => this.emit("log", "warn", msg),
			error: (msg: string) => this.emit("log", "error", msg),
		};
	}

	/**
	 * Execute a list of tasks for a given operation
	 */
	async execute(tasks: Task[], operation: Operation): Promise<TaskResult[]> {
		const results: TaskResult[] = [];
		const registry = getPluginRegistry();
		const context: ExecutionContext = {
			...this.baseContext,
			operation,
		};

		this.emit("execution:start", tasks, operation);

		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i]!;
			const taskName = this.getTaskName(task);

			this.emit("task:start", task, i, tasks.length);

			const start = performance.now();

			try {
				// Find the plugin key in the task
				const pluginKey = this.findPluginKey(task);
				if (!pluginKey) {
					throw new Error(`No plugin key found in task: ${JSON.stringify(task)}`);
				}

				const plugin = registry.get(pluginKey);
				if (!plugin) {
					throw new Error(`Plugin not found: ${pluginKey}`);
				}

				// Extract params for the plugin
				const params = (task as Record<string, unknown>)[pluginKey];

				// Execute the plugin
				const result = await plugin.execute(params, context);
				const duration = performance.now() - start;

				results.push({ task, result, duration });
				this.emit("task:complete", task, result, i, tasks.length);

				// Stop on failure if configured
				if (!result.success && this.stopOnError) {
					context.logger.error(`Task failed: ${taskName} - ${result.message}`);
					break;
				}
			} catch (error) {
				const duration = performance.now() - start;
				const errorMessage = error instanceof Error ? error.message : String(error);

				const failResult: PluginResult = {
					success: false,
					message: errorMessage,
					changed: false,
				};

				results.push({ task, result: failResult, duration });
				this.emit("task:error", task, error as Error, i, tasks.length);

				if (this.stopOnError) {
					context.logger.error(`Task error: ${taskName} - ${errorMessage}`);
					break;
				}
			}
		}

		this.emit("execution:complete", results);
		return results;
	}

	/**
	 * Find the plugin key in a task object
	 */
	private findPluginKey(task: Task): string | null {
		for (const key of PLUGIN_KEYS) {
			if (key in task) {
				return key;
			}
		}
		return null;
	}

	/**
	 * Get a human-readable task name
	 */
	private getTaskName(task: Task): string {
		// Use explicit name if provided
		if ("name" in task && typeof task.name === "string") {
			return task.name;
		}

		// Otherwise, generate from plugin key and params
		const pluginKey = this.findPluginKey(task);
		if (pluginKey) {
			const params = (task as Record<string, unknown>)[pluginKey] as Record<string, unknown>;
			const identifier = params.name || params.path || params.dest || params.hostname;
			if (identifier) {
				return `${pluginKey}: ${identifier}`;
			}
			return pluginKey;
		}

		return "unknown task";
	}
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Execute tasks with default options
 */
export async function executeTasks(
	tasks: Task[],
	operation: Operation,
	options?: ExecutorOptions,
): Promise<TaskResult[]> {
	const executor = new TaskExecutor(options);
	return executor.execute(tasks, operation);
}

/**
 * Check if all task results were successful
 */
export function allSucceeded(results: TaskResult[]): boolean {
	return results.every((r) => r.result.success);
}

/**
 * Get failed task results
 */
export function getFailures(results: TaskResult[]): TaskResult[] {
	return results.filter((r) => !r.result.success);
}

/**
 * Get changed task results
 */
export function getChanges(results: TaskResult[]): TaskResult[] {
	return results.filter((r) => r.result.changed);
}
