/**
 * OperationManager - tracks async module operations and bridges to SSE
 *
 * This module provides a singleton that manages asynchronous operations
 * (install, remove, start, stop) and broadcasts progress to SSE subscribers.
 */

import { join } from "node:path";
import { type SSEEvent, formatSSEMessage, sendSSEEvent } from "../server/sse.ts";
import { type Config, getTargetHostname } from "../types/config.ts";
import { DockerError } from "../types/errors.ts";
import type { TargetModule } from "../types/module.ts";
import type { ProxyRoute, TargetState } from "../types/state.ts";
import { logger } from "../utils/logger.ts";
import { getComposeManager } from "./compose-manager.ts";
import { getConfigManager } from "./config-manager.ts";
import { getDockerClient } from "./docker-client.ts";
import { getModuleLoader } from "./module-loader.ts";
import { getStateManager } from "./state-manager.ts";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build environment variables with full hostnames from configured domain
 * Transforms variables ending in _HOST to use getTargetHostname()
 */
function buildEnvWithDomain(
  moduleEnv: Record<string, string> | undefined,
  config: Config,
): Record<string, string> {
  if (!moduleEnv) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(moduleEnv)) {
    // Transform hostname variables to use configured domain
    if (key.endsWith("_HOST")) {
      result[key] = getTargetHostname(config, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// =============================================================================
// Types
// =============================================================================

export type OperationType = "install" | "remove" | "start" | "stop";
export type OperationStatus = "queued" | "running" | "completed" | "failed";

export interface TrackedOperation {
  id: string;
  module: string;
  operation: OperationType;
  status: OperationStatus;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  subscribers: Set<ReadableStreamDefaultController<Uint8Array>>;
}

export interface OperationResult {
  success: boolean;
  error?: string;
  duration: number; // milliseconds
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OPERATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const OPERATION_CLEANUP_AGE = 60 * 60 * 1000; // 1 hour

// =============================================================================
// OperationManager
// =============================================================================

let instance: OperationManager | null = null;

export class OperationManager {
  private operations = new Map<string, TrackedOperation>();
  private moduleOperations = new Map<string, string>(); // module -> operationId
  private cleanupTimer?: ReturnType<typeof setInterval>;

  private constructor() {
    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this.cleanup(), OPERATION_CLEANUP_AGE / 2);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): OperationManager {
    if (!instance) {
      instance = new OperationManager();
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
  async createOperation(moduleName: string, operation: OperationType): Promise<TrackedOperation> {
    // Generate operation ID
    const id = crypto.randomUUID();

    // Create tracked operation
    const tracked: TrackedOperation = {
      id,
      module: moduleName,
      operation,
      status: "queued",
      startedAt: new Date(),
      subscribers: new Set(),
    };

    this.operations.set(id, tracked);
    this.moduleOperations.set(moduleName.toLowerCase(), id);

    logger.info(`Operation created: ${id} (${operation} ${moduleName})`);

    // Start execution asynchronously (don't await)
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
  hasOperationInProgress(moduleName: string): boolean {
    const operationId = this.moduleOperations.get(moduleName.toLowerCase());
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

    // If operation already completed, send completion event immediately
    if (operation.status === "completed" || operation.status === "failed") {
      const duration = operation.completedAt
        ? operation.completedAt.getTime() - operation.startedAt.getTime()
        : 0;

      sendSSEEvent(controller, {
        type: "complete",
        success: operation.status === "completed",
        error: operation.error,
        duration,
      });
    }

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
    // Set timeout
    const timeoutHandle = setTimeout(() => {
      if (tracked.status === "running") {
        this.failOperation(tracked, "Operation timed out");
      }
    }, DEFAULT_OPERATION_TIMEOUT);

    try {
      tracked.status = "running";

      // Broadcast initial progress
      this.broadcast(tracked.id, {
        type: "progress",
        percent: 0,
        message: `Starting ${tracked.operation}...`,
      });

      switch (tracked.operation) {
        case "install":
          await this.executeInstall(tracked);
          break;
        case "remove":
          await this.executeRemove(tracked);
          break;
        case "start":
          await this.executeStart(tracked);
          break;
        case "stop":
          await this.executeStop(tracked);
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.failOperation(tracked, message);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Execute install operation
   */
  private async executeInstall(tracked: TrackedOperation): Promise<void> {
    const moduleLoader = await getModuleLoader();
    const stateManager = getStateManager();
    const configManager = getConfigManager();
    const composeManager = await getComposeManager();
    const docker = getDockerClient();
    const config = await configManager.get();

    // Task 1: Check Docker
    this.broadcast(tracked.id, {
      type: "task",
      name: "Checking Docker connection",
      status: "running",
    });

    await docker.checkPermissions();

    this.broadcast(tracked.id, {
      type: "task",
      name: "Checking Docker connection",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 10,
      message: "Docker connected",
    });

    // Task 2: Load module
    this.broadcast(tracked.id, {
      type: "task",
      name: "Loading module",
      status: "running",
    });

    const module = await moduleLoader.findModule(tracked.module);
    if (!module) {
      throw new Error(`Module not found: ${tracked.module}`);
    }

    if (module.category !== "targets") {
      throw new Error("Only target modules can be installed via dashboard");
    }

    this.broadcast(tracked.id, {
      type: "task",
      name: "Loading module",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 20,
      message: "Module loaded",
    });

    // Task 3: Pull images and start containers
    this.broadcast(tracked.id, {
      type: "task",
      name: "Starting containers",
      status: "running",
    });

    this.broadcast(tracked.id, {
      type: "log",
      line: `Running docker compose up for ${module.name}`,
      level: "info",
    });

    // Build environment variables with configured domain
    const env = buildEnvWithDomain(module.env, config);

    // Run docker compose up with transformed environment
    await this.runComposeCommand(module as TargetModule, tracked, "up", env);

    this.broadcast(tracked.id, {
      type: "task",
      name: "Starting containers",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 80,
      message: "Containers started",
    });

    // Task 4: Update state
    this.broadcast(tracked.id, {
      type: "task",
      name: "Updating state",
      status: "running",
    });

    // Build routes for state
    const routes: ProxyRoute[] = (module as TargetModule).proxy.map((p) => ({
      hostname: getTargetHostname(config, p.hostname),
      service: p.service,
      port: p.port,
    }));

    const targetState: TargetState = {
      name: module.name,
      installed_at: new Date().toISOString(),
      compose_project: composeManager.getProjectName(module.name),
      routes,
    };

    await stateManager.addTarget(targetState);

    this.broadcast(tracked.id, {
      type: "task",
      name: "Updating state",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 100,
      message: "Installation complete",
    });

    // Complete
    this.completeOperation(tracked);
  }

  /**
   * Execute remove operation
   */
  private async executeRemove(tracked: TrackedOperation): Promise<void> {
    const moduleLoader = await getModuleLoader();
    const stateManager = getStateManager();

    // Task 1: Load module
    this.broadcast(tracked.id, {
      type: "task",
      name: "Loading module",
      status: "running",
    });

    const module = await moduleLoader.findModule(tracked.module);
    if (!module || module.category !== "targets") {
      throw new Error(`Target not found: ${tracked.module}`);
    }

    this.broadcast(tracked.id, {
      type: "task",
      name: "Loading module",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 20,
      message: "Module loaded",
    });

    // Task 2: Stop and remove containers
    this.broadcast(tracked.id, {
      type: "task",
      name: "Removing containers",
      status: "running",
    });

    await this.runComposeCommand(module as TargetModule, tracked, "down");

    this.broadcast(tracked.id, {
      type: "task",
      name: "Removing containers",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 80,
      message: "Containers removed",
    });

    // Task 3: Update state
    this.broadcast(tracked.id, {
      type: "task",
      name: "Updating state",
      status: "running",
    });

    await stateManager.removeTarget(tracked.module);

    this.broadcast(tracked.id, {
      type: "task",
      name: "Updating state",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 100,
      message: "Removal complete",
    });

    this.completeOperation(tracked);
  }

  /**
   * Execute start operation
   */
  private async executeStart(tracked: TrackedOperation): Promise<void> {
    const moduleLoader = await getModuleLoader();

    // Task 1: Load module
    this.broadcast(tracked.id, {
      type: "task",
      name: "Loading module",
      status: "running",
    });

    const module = await moduleLoader.findModule(tracked.module);
    if (!module || module.category !== "targets") {
      throw new Error(`Target not found: ${tracked.module}`);
    }

    this.broadcast(tracked.id, {
      type: "task",
      name: "Loading module",
      status: "completed",
    });

    // Task 2: Start containers
    this.broadcast(tracked.id, {
      type: "task",
      name: "Starting containers",
      status: "running",
    });

    await this.runComposeCommand(module as TargetModule, tracked, "start");

    this.broadcast(tracked.id, {
      type: "task",
      name: "Starting containers",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 100,
      message: "Started",
    });

    this.completeOperation(tracked);
  }

  /**
   * Execute stop operation
   */
  private async executeStop(tracked: TrackedOperation): Promise<void> {
    const moduleLoader = await getModuleLoader();

    // Task 1: Load module
    this.broadcast(tracked.id, {
      type: "task",
      name: "Loading module",
      status: "running",
    });

    const module = await moduleLoader.findModule(tracked.module);
    if (!module || module.category !== "targets") {
      throw new Error(`Target not found: ${tracked.module}`);
    }

    this.broadcast(tracked.id, {
      type: "task",
      name: "Loading module",
      status: "completed",
    });

    // Task 2: Stop containers
    this.broadcast(tracked.id, {
      type: "task",
      name: "Stopping containers",
      status: "running",
    });

    await this.runComposeCommand(module as TargetModule, tracked, "stop");

    this.broadcast(tracked.id, {
      type: "task",
      name: "Stopping containers",
      status: "completed",
    });

    this.broadcast(tracked.id, {
      type: "progress",
      percent: 100,
      message: "Stopped",
    });

    this.completeOperation(tracked);
  }

  /**
   * Run a docker compose command with output capture
   */
  private async runComposeCommand(
    module: TargetModule,
    tracked: TrackedOperation,
    command: "up" | "down" | "start" | "stop",
    envOverride?: Record<string, string>,
  ): Promise<void> {
    const composeManager = await getComposeManager();

    if (!module.path) {
      throw new DockerError("Module path not set");
    }

    // Determine compose file path
    let composePath = join(module.path, "compose.rendered.yml");
    if (!(await Bun.file(composePath).exists())) {
      composePath = join(module.path, module.compose);
    }

    // For 'up' command, ensure network and render template
    if (command === "up") {
      await composeManager.ensureNetwork();
      // Use override if provided, otherwise fall back to module.env
      const env = envOverride ?? module.env ?? {};
      composePath = await composeManager.renderTemplate(module, env);
    }

    const projectName = composeManager.getProjectName(module.name);

    // Build command args
    const args =
      command === "up"
        ? ["docker", "compose", "-f", composePath, "-p", projectName, "up", "-d", "--no-start"]
        : ["docker", "compose", "-f", composePath, "-p", projectName, command];

    // Run with captured output
    const proc = Bun.spawn(args, {
      cwd: module.path,
      stdout: "pipe",
      stderr: "pipe",
    });

    // Stream stdout
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split("\n").filter((l) => l.trim())) {
            this.broadcast(tracked.id, { type: "log", line, level: "info" });
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    // Stream stderr
    if (proc.stderr) {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split("\n").filter((l) => l.trim())) {
            this.broadcast(tracked.id, { type: "log", line, level: "error" });
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new DockerError(`docker compose ${command} failed with exit code ${exitCode}`);
    }

    // Clean up rendered file after 'down' command
    if (command === "down") {
      const renderedPath = join(module.path, "compose.rendered.yml");
      if (await Bun.file(renderedPath).exists()) {
        await Bun.spawn(["rm", renderedPath]).exited;
      }
    }
  }

  /**
   * Mark operation as completed
   */
  private completeOperation(tracked: TrackedOperation): void {
    tracked.status = "completed";
    tracked.completedAt = new Date();

    const duration = tracked.completedAt.getTime() - tracked.startedAt.getTime();

    logger.info(`Operation completed: ${tracked.id} (${duration}ms)`);

    this.broadcast(tracked.id, {
      type: "complete",
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
    tracked.status = "failed";
    tracked.completedAt = new Date();
    tracked.error = error;

    const duration = tracked.completedAt.getTime() - tracked.startedAt.getTime();

    logger.error(`Operation failed: ${tracked.id} - ${error}`);

    this.broadcast(tracked.id, {
      type: "complete",
      success: false,
      error,
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

/**
 * Get the singleton OperationManager instance
 */
export function getOperationManager(): OperationManager {
  return OperationManager.getInstance();
}
