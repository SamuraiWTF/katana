import { homedir } from "node:os";
import { join } from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import {
	type InstalledModule,
	type InstalledState,
	InstalledStateSchema,
	LockFileYamlSchema,
	type LockState,
} from "../types/state";
import { ModuleStatus } from "../types/status";

// =============================================================================
// Types
// =============================================================================

export interface LockOptions {
	/** Who is enabling the lock (defaults to USER env var or "unknown") */
	lockedBy?: string;
	/** Optional message explaining why lock is enabled */
	message?: string;
}

export interface StateManagerOptions {
	/** Base directory for state files (default: ~/.local/share/katana/) */
	stateDir?: string;
}

// =============================================================================
// StateManager Class
// =============================================================================

export class StateManager {
	private stateDir: string;
	private installedPath: string;
	private lockPath: string;

	private static instance: StateManager | null = null;

	constructor(options?: StateManagerOptions) {
		this.stateDir = options?.stateDir ?? this.resolveDefaultStateDir();
		this.installedPath = join(this.stateDir, "installed.yml");
		this.lockPath = join(this.stateDir, "katana.lock");
	}

	/**
	 * Resolve the default state directory
	 */
	private resolveDefaultStateDir(): string {
		return join(homedir(), ".local", "share", "katana");
	}

	/**
	 * Get or create the singleton instance
	 */
	static getInstance(options?: StateManagerOptions): StateManager {
		if (!StateManager.instance) {
			StateManager.instance = new StateManager(options);
		}
		return StateManager.instance;
	}

	/**
	 * Reset singleton (useful for testing)
	 */
	static resetInstance(): void {
		StateManager.instance = null;
	}

	/**
	 * Get the state directory path
	 */
	getStateDir(): string {
		return this.stateDir;
	}

	// =========================================================================
	// State Directory Management
	// =========================================================================

	/**
	 * Ensure the state directory exists
	 */
	async ensureStateDir(): Promise<void> {
		const file = Bun.file(this.stateDir);
		if (!(await file.exists())) {
			await Bun.$`mkdir -p ${this.stateDir}`.quiet();
		}
	}

	/**
	 * Atomic write: write to temp file, then rename
	 */
	private async atomicWrite(path: string, content: string): Promise<void> {
		await this.ensureStateDir();
		const tempPath = `${path}.tmp.${Date.now()}`;
		await Bun.write(tempPath, content);
		await Bun.$`mv ${tempPath} ${path}`.quiet();
	}

	// =========================================================================
	// Installed Modules Management
	// =========================================================================

	/**
	 * Get current installed state (reads from file)
	 */
	async getInstalledState(): Promise<InstalledState> {
		const file = Bun.file(this.installedPath);
		const exists = await file.exists();

		if (!exists) {
			// Return a fresh copy to prevent mutation of shared state
			return { modules: {} };
		}

		try {
			const content = await file.text();
			const parsed = yamlParse(content);
			const result = InstalledStateSchema.safeParse(parsed);

			if (result.success) {
				return result.data;
			}

			// If parsing fails, return empty state
			console.warn(`Warning: Invalid installed.yml format, treating as empty`);
			return { modules: {} };
		} catch {
			// File read or YAML parse error
			return { modules: {} };
		}
	}

	/**
	 * Save installed state to file
	 */
	private async saveInstalledState(state: InstalledState): Promise<void> {
		const content = yamlStringify(state);
		await this.atomicWrite(this.installedPath, content);
	}

	/**
	 * Check if a specific module is installed
	 */
	async isModuleInstalled(moduleName: string): Promise<boolean> {
		const state = await this.getInstalledState();
		const normalizedName = moduleName.toLowerCase();
		return normalizedName in state.modules;
	}

	/**
	 * Mark a module as installed
	 */
	async installModule(moduleName: string, version?: string): Promise<void> {
		const state = await this.getInstalledState();
		const normalizedName = moduleName.toLowerCase();

		const moduleInfo: InstalledModule = {
			installedAt: new Date().toISOString(),
		};
		if (version) {
			moduleInfo.version = version;
		}

		state.modules[normalizedName] = moduleInfo;
		await this.saveInstalledState(state);
	}

	/**
	 * Remove a module from installed state
	 */
	async removeModule(moduleName: string): Promise<void> {
		const state = await this.getInstalledState();
		const normalizedName = moduleName.toLowerCase();

		delete state.modules[normalizedName];
		await this.saveInstalledState(state);
	}

	/**
	 * Get list of all installed module names
	 */
	async getInstalledModuleNames(): Promise<string[]> {
		const state = await this.getInstalledState();
		return Object.keys(state.modules);
	}

	/**
	 * Get installation metadata for a module
	 */
	async getModuleInstallInfo(moduleName: string): Promise<InstalledModule | null> {
		const state = await this.getInstalledState();
		const normalizedName = moduleName.toLowerCase();
		return state.modules[normalizedName] ?? null;
	}

	// =========================================================================
	// Lock Mode Management
	// =========================================================================

	/**
	 * Get current lock state (handles both legacy and YAML formats)
	 */
	async getLockState(): Promise<LockState> {
		const file = Bun.file(this.lockPath);

		if (!(await file.exists())) {
			// Return a fresh copy to prevent mutation of shared state
			return { locked: false, modules: [] };
		}

		try {
			const content = await file.text();

			// Try to parse as YAML first
			try {
				const parsed = yamlParse(content);

				// Check if it's the new YAML format (has 'locked' key)
				if (parsed && typeof parsed === "object" && "locked" in parsed) {
					const result = LockFileYamlSchema.safeParse(parsed);
					if (result.success) {
						return result.data;
					}
				}
			} catch {
				// Not valid YAML, try legacy format
			}

			// Try legacy format: newline-separated module names
			const modules = content
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0);

			if (modules.length > 0) {
				return {
					locked: true,
					modules,
				};
			}

			return { locked: false, modules: [] };
		} catch {
			return { locked: false, modules: [] };
		}
	}

	/**
	 * Check if system is currently locked
	 */
	async isLocked(): Promise<boolean> {
		const state = await this.getLockState();
		return state.locked;
	}

	/**
	 * Enable lock mode, capturing current installed modules
	 */
	async enableLock(options?: LockOptions): Promise<void> {
		const installedModules = await this.getInstalledModuleNames();

		const lockState: LockState = {
			locked: true,
			modules: installedModules,
			lockedAt: new Date().toISOString(),
			lockedBy: options?.lockedBy ?? process.env.USER ?? "unknown",
			message: options?.message,
		};

		const content = yamlStringify(lockState);
		await this.atomicWrite(this.lockPath, content);
	}

	/**
	 * Disable lock mode
	 */
	async disableLock(): Promise<void> {
		const file = Bun.file(this.lockPath);

		if (await file.exists()) {
			await Bun.$`rm ${this.lockPath}`.quiet();
		}
	}

	/**
	 * Get modules that were installed when lock was enabled
	 */
	async getLockedModules(): Promise<string[]> {
		const state = await this.getLockState();
		return state.modules;
	}

	// =========================================================================
	// Module Status
	// =========================================================================

	/**
	 * Get the status of a module using ModuleStatus enum.
	 * Returns NOT_INSTALLED or INSTALLED based on the state file.
	 * For running/stopped status, use StatusChecker which performs live checks.
	 */
	async getModuleStatus(moduleName: string): Promise<ModuleStatus> {
		const isInstalled = await this.isModuleInstalled(moduleName);
		return isInstalled ? ModuleStatus.INSTALLED : ModuleStatus.NOT_INSTALLED;
	}
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get the singleton StateManager instance
 */
export function getStateManager(options?: StateManagerOptions): StateManager {
	return StateManager.getInstance(options);
}
