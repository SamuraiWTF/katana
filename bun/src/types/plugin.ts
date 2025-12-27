import { z } from "zod";

/**
 * Result returned by a plugin action (install, remove, start, stop)
 */
export const PluginResultSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	changed: z.boolean().default(false),
});

export type PluginResult = z.infer<typeof PluginResultSchema>;

/**
 * Operation type indicating which module section is being executed
 */
export type Operation = "install" | "remove" | "start" | "stop";

/**
 * Context provided to plugins during execution
 */
export interface ExecutionContext {
	/** When true, plugin should simulate actions without making changes */
	mock: boolean;
	/** When true, plugin should log what it would do without executing */
	dryRun: boolean;
	/** Logger instance for plugin output */
	logger: Logger;
	/** The operation being performed (install/remove/start/stop) */
	operation: Operation;
}

/**
 * Simple logger interface for plugin output
 */
export interface Logger {
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
}

/**
 * Plugin interface for implementing task handlers.
 *
 * Plugins handle specific task types (docker, service, lineinfile, etc.)
 * and provide methods for both execution and status checking.
 */
export interface IPlugin {
	/** Unique name identifying this plugin (e.g., 'docker', 'service') */
	readonly name: string;

	/**
	 * Execute the plugin's primary action.
	 * The operation (install/remove/start/stop) is determined by context.
	 */
	execute(params: unknown, context: ExecutionContext): Promise<PluginResult>;

	/**
	 * Check if the resource managed by this plugin exists.
	 * Used for status.installed.exists checks.
	 */
	exists?(params: unknown): Promise<boolean>;

	/**
	 * Check if the resource managed by this plugin is running/started.
	 * Used for status.running.started checks.
	 */
	started?(params: unknown): Promise<boolean>;
}

/**
 * Base class for plugins providing common functionality.
 * Concrete plugins should extend this class.
 */
export abstract class BasePlugin implements IPlugin {
	abstract readonly name: string;

	abstract execute(params: unknown, context: ExecutionContext): Promise<PluginResult>;

	/**
	 * Helper to create a successful result
	 */
	protected success(message?: string, changed = true): PluginResult {
		return { success: true, message, changed };
	}

	/**
	 * Helper to create a failure result
	 */
	protected failure(message: string): PluginResult {
		return { success: false, message, changed: false };
	}

	/**
	 * Helper to create a no-op result (success but no changes made)
	 */
	protected noop(message?: string): PluginResult {
		return { success: true, message, changed: false };
	}
}
