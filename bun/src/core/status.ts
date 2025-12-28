import { PluginRegistry } from "../plugins/registry";
import type { ExistsCheck, StartedCheck } from "../types/module";
import { ModuleStatus } from "../types/status";
import type { LoadedModule } from "./module-loader";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a status check for a single module
 */
export interface StatusResult {
	/** Overall status (derived from installed + running) */
	status: ModuleStatus;
	/** Whether the module is installed */
	installed: boolean;
	/** Whether the module is running */
	running: boolean;
	/** Timestamp when the check was performed */
	checkedAt: number;
}

/**
 * Options for the StatusChecker
 */
export interface StatusCheckerOptions {
	/** Cache TTL in milliseconds (default: 5000) */
	cacheTTL?: number;
}

// =============================================================================
// StatusChecker Class
// =============================================================================

/**
 * Checks module status by executing exists/started checks via plugins.
 *
 * Features:
 * - Execute exists checks for installed status
 * - Execute started checks for running status
 * - Result caching with configurable TTL
 * - Batch checking for multiple modules in parallel
 */
export class StatusChecker {
	private cache: Map<string, StatusResult> = new Map();
	private cacheTTL: number;
	private registry: PluginRegistry;
	private pluginsLoaded = false;

	constructor(options: StatusCheckerOptions = {}) {
		this.cacheTTL = options.cacheTTL ?? 5000;
		this.registry = PluginRegistry.getInstance();
	}

	/**
	 * Ensure plugins are loaded before checking status
	 */
	private async ensurePluginsLoaded(): Promise<void> {
		if (!this.pluginsLoaded) {
			await this.registry.loadBuiltinPlugins();
			this.pluginsLoaded = true;
		}
	}

	/**
	 * Check status of a single module.
	 * Returns cached result if still valid.
	 */
	async checkStatus(module: LoadedModule): Promise<StatusResult> {
		const cacheKey = module.name.toLowerCase();
		const cached = this.cache.get(cacheKey);

		// Return cached if valid
		if (cached && Date.now() - cached.checkedAt < this.cacheTTL) {
			return cached;
		}

		await this.ensurePluginsLoaded();

		let installed = false;
		let running = false;

		// Check installed status via exists check
		if (module.status?.installed?.exists) {
			installed = await this.executeExistsCheck(module.status.installed.exists);
		}

		// Check running status via started check
		if (module.status?.running?.started) {
			running = await this.executeStartedCheck(module.status.running.started);
		}

		// Determine final status using hierarchy
		// If not installed, can't be running
		// If installed and running -> RUNNING
		// If installed and not running -> STOPPED (or INSTALLED if no running check)
		// If not installed -> NOT_INSTALLED
		let status: ModuleStatus;
		if (!installed) {
			status = ModuleStatus.NOT_INSTALLED;
			running = false; // Can't be running if not installed
		} else if (running) {
			status = ModuleStatus.RUNNING;
		} else if (module.status?.running?.started) {
			// Has a running check but it returned false -> STOPPED
			status = ModuleStatus.STOPPED;
		} else {
			// No running check defined -> just INSTALLED
			status = ModuleStatus.INSTALLED;
		}

		const result: StatusResult = {
			status,
			installed,
			running,
			checkedAt: Date.now(),
		};

		this.cache.set(cacheKey, result);
		return result;
	}

	/**
	 * Check status of multiple modules in parallel.
	 * Returns a map of module name (lowercase) to status result.
	 */
	async checkStatusBatch(modules: LoadedModule[]): Promise<Map<string, StatusResult>> {
		await this.ensurePluginsLoaded();

		const results = new Map<string, StatusResult>();
		const promises = modules.map(async (module) => {
			const result = await this.checkStatus(module);
			results.set(module.name.toLowerCase(), result);
		});

		await Promise.all(promises);
		return results;
	}

	/**
	 * Clear the cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Execute an exists check using the appropriate plugin.
	 *
	 * The ExistsCheck object has optional fields for each plugin type:
	 * - docker: container name
	 * - service: service name
	 * - path: file/directory path
	 */
	private async executeExistsCheck(check: ExistsCheck): Promise<boolean> {
		try {
			if (check.docker) {
				const plugin = this.registry.get("docker");
				if (plugin?.exists) {
					return await plugin.exists({ name: check.docker });
				}
			}

			if (check.service) {
				const plugin = this.registry.get("service");
				if (plugin?.exists) {
					return await plugin.exists({ name: check.service, state: "running" });
				}
			}

			if (check.path) {
				const plugin = this.registry.get("file");
				if (plugin?.exists) {
					return await plugin.exists({ path: check.path, state: "directory" });
				}
			}

			return false;
		} catch {
			return false;
		}
	}

	/**
	 * Execute a started check using the appropriate plugin.
	 *
	 * The StartedCheck object has optional fields for each plugin type:
	 * - docker: container name
	 * - service: service name
	 */
	private async executeStartedCheck(check: StartedCheck): Promise<boolean> {
		try {
			if (check.docker) {
				const plugin = this.registry.get("docker");
				if (plugin?.started) {
					return await plugin.started({ name: check.docker });
				}
			}

			if (check.service) {
				const plugin = this.registry.get("service");
				if (plugin?.started) {
					return await plugin.started({ name: check.service, state: "running" });
				}
			}

			return false;
		} catch {
			return false;
		}
	}

	/**
	 * Format status result for display.
	 * Returns strings like "installed, running" or "not installed"
	 */
	static formatStatus(result: StatusResult): string {
		if (!result.installed) {
			return "not installed";
		}

		const parts: string[] = ["installed"];
		if (result.running) {
			parts.push("running");
		} else if (result.status === ModuleStatus.STOPPED) {
			parts.push("stopped");
		}

		return parts.join(", ");
	}
}
