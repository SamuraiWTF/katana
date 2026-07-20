import YAML from "yaml";
import { type Config, DEFAULT_CONFIG, parseConfig } from "../types/config.ts";
import { ConfigError } from "../types/errors.ts";
import { ensureParentDir, getConfigPath, resolvePath } from "../utils/paths.ts";

/**
 * Manages system configuration
 */
export class ConfigManager {
  private configPath: string;
  private config: Config | null = null;

  constructor(configPath?: string) {
    this.configPath = resolvePath(configPath ?? getConfigPath());
  }

  /**
   * Load configuration from disk
   * Creates default config if not exists
   */
  async load(): Promise<Config> {
    const file = Bun.file(this.configPath);
    const exists = await file.exists();

    if (!exists) {
      // Create default config
      await this.save(DEFAULT_CONFIG);
      this.config = DEFAULT_CONFIG;
      return this.config;
    }

    try {
      const content = await file.text();
      const data = YAML.parse(content);
      this.config = parseConfig(data);
      return this.config;
    } catch (error) {
      if (error instanceof Error) {
        throw new ConfigError(`Failed to load config: ${error.message}`);
      }
      throw new ConfigError("Failed to load config: Unknown error");
    }
  }

  /**
   * Save configuration to disk
   */
  async save(config: Config): Promise<void> {
    try {
      await ensureParentDir(this.configPath);
      const content = YAML.stringify(config);
      await Bun.write(this.configPath, content);
      this.config = config;
    } catch (error) {
      if (error instanceof Error) {
        throw new ConfigError(`Failed to save config: ${error.message}`);
      }
      throw new ConfigError("Failed to save config: Unknown error");
    }
  }

  /**
   * Get current configuration (loads if not cached)
   */
  async get(): Promise<Config> {
    if (this.config === null) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Get the config file path
   */
  getPath(): string {
    return this.configPath;
  }
}

// Default singleton instance
let defaultInstance: ConfigManager | null = null;

/**
 * Initialize the default ConfigManager instance with a custom path
 * Must be called before first getConfigManager() call
 */
export function initConfigManager(configPath?: string): void {
  if (defaultInstance !== null) {
    throw new ConfigError("ConfigManager already initialized");
  }
  defaultInstance = new ConfigManager(configPath);
}

/**
 * Get the default ConfigManager instance
 */
export function getConfigManager(): ConfigManager {
  if (defaultInstance === null) {
    defaultInstance = new ConfigManager();
  }
  return defaultInstance;
}
