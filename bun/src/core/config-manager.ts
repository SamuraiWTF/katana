import { homedir } from "node:os";
import { parse as yamlParse } from "yaml";
import { CONFIG_PATHS, type Config, ConfigSchema, DEFAULT_CONFIG } from "../types/config";

// =============================================================================
// Types
// =============================================================================

export interface ConfigManagerOptions {
	/** Override config paths for testing */
	configPaths?: readonly string[];
}

// =============================================================================
// ConfigManager Class
// =============================================================================

export class ConfigManager {
	private config: Config | null = null;
	private configPath: string | null = null;
	private configPaths: readonly string[];
	private loaded = false;

	private static instance: ConfigManager | null = null;

	constructor(options?: ConfigManagerOptions) {
		this.configPaths = options?.configPaths ?? CONFIG_PATHS;
	}

	/**
	 * Get or create the singleton instance
	 */
	static getInstance(options?: ConfigManagerOptions): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager(options);
		}
		return ConfigManager.instance;
	}

	/**
	 * Reset singleton (useful for testing)
	 */
	static resetInstance(): void {
		ConfigManager.instance = null;
	}

	/**
	 * Expand ~ to home directory in path
	 */
	private expandPath(path: string): string {
		if (path.startsWith("~/")) {
			return path.replace("~", homedir());
		}
		return path;
	}

	/**
	 * Find the first existing config file from config paths
	 */
	private async findConfigFile(): Promise<string | null> {
		for (const path of this.configPaths) {
			const expandedPath = this.expandPath(path);
			const file = Bun.file(expandedPath);
			if (await file.exists()) {
				return expandedPath;
			}
		}
		return null;
	}

	/**
	 * Load configuration from the first existing config file.
	 * Falls back to DEFAULT_CONFIG if no file found or invalid.
	 */
	async loadConfig(): Promise<Config> {
		// Return cached config if already loaded
		if (this.loaded && this.config) {
			return this.config;
		}

		const configFile = await this.findConfigFile();

		if (!configFile) {
			// No config file found, use defaults
			this.config = DEFAULT_CONFIG;
			this.configPath = null;
			this.loaded = true;
			return this.config;
		}

		try {
			const file = Bun.file(configFile);
			const content = await file.text();
			const parsed = yamlParse(content);

			const result = ConfigSchema.safeParse(parsed);

			if (result.success) {
				this.config = result.data;
				this.configPath = configFile;
				this.loaded = true;
				return this.config;
			}

			// Zod validation failed
			console.warn(`Warning: Invalid config format in ${configFile}, using defaults`);
			if (result.error?.issues) {
				console.warn(`  ${result.error.issues.map((e) => e.message).join(", ")}`);
			}
			this.config = DEFAULT_CONFIG;
			this.configPath = null;
			this.loaded = true;
			return this.config;
		} catch (error) {
			// YAML parse error or file read error
			console.warn(`Warning: Error reading config from ${configFile}, using defaults`);
			if (error instanceof Error) {
				console.warn(`  ${error.message}`);
			}
			this.config = DEFAULT_CONFIG;
			this.configPath = null;
			this.loaded = true;
			return this.config;
		}
	}

	/**
	 * Get the currently loaded config (or DEFAULT_CONFIG if not loaded)
	 */
	getConfig(): Config {
		if (this.config) {
			return this.config;
		}
		return DEFAULT_CONFIG;
	}

	/**
	 * Get the path of the loaded config file, or null if using defaults
	 */
	getConfigPath(): string | null {
		return this.configPath;
	}

	/**
	 * Check if config has been loaded
	 */
	isLoaded(): boolean {
		return this.loaded;
	}

	/**
	 * Force reload config from file system
	 */
	async reloadConfig(): Promise<Config> {
		this.loaded = false;
		this.config = null;
		this.configPath = null;
		return this.loadConfig();
	}
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get the singleton ConfigManager instance
 */
export function getConfigManager(options?: ConfigManagerOptions): ConfigManager {
	return ConfigManager.getInstance(options);
}
