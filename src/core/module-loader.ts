import { readdir } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { ModuleError, NotFoundError } from "../types/errors.ts";
import { type Module, parseModule } from "../types/module.ts";
import { resolvePath } from "../utils/paths.ts";
import { getConfigManager } from "./config-manager.ts";

/**
 * Loads and validates module definitions from the modules directory
 */
export class ModuleLoader {
  private modulesPath: string;
  private cache: Map<string, Module> = new Map();

  constructor(modulesPath: string) {
    this.modulesPath = resolvePath(modulesPath);
  }

  /**
   * Scan and load all modules (targets and tools)
   */
  async loadAll(): Promise<Module[]> {
    const targets = await this.loadByCategory("targets");
    const tools = await this.loadByCategory("tools");
    return [...targets, ...tools];
  }

  /**
   * Load modules by category
   */
  async loadByCategory(category: "targets" | "tools"): Promise<Module[]> {
    const categoryPath = join(this.modulesPath, category);
    const modules: Module[] = [];

    try {
      const entries = await readdir(categoryPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const modulePath = join(categoryPath, entry.name);
        const isValid = await this.validateModuleDir(modulePath);

        if (isValid) {
          try {
            const module = await this.parseModuleFile(modulePath);
            modules.push(module);
          } catch (error) {
            // Log warning but continue loading other modules
            console.warn(
              `Warning: Failed to load module at ${modulePath}: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read - return empty array
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }

    return modules;
  }

  /**
   * Load a specific module by name
   * @throws NotFoundError if module doesn't exist
   */
  async loadModule(name: string): Promise<Module> {
    // Check cache first
    const cached = this.cache.get(name);
    if (cached) return cached;

    // Search in targets and tools directories
    for (const category of ["targets", "tools"] as const) {
      const modulePath = join(this.modulesPath, category, name);
      const isValid = await this.validateModuleDir(modulePath);

      if (isValid) {
        return this.parseModuleFile(modulePath);
      }
    }

    throw new NotFoundError("Module", name);
  }

  /**
   * Find a module by name (returns undefined if not found)
   */
  async findModule(name: string): Promise<Module | undefined> {
    try {
      return await this.loadModule(name);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Clear the module cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get the modules directory path
   */
  getPath(): string {
    return this.modulesPath;
  }

  /**
   * Validate that a directory contains a valid module structure
   */
  private async validateModuleDir(dirPath: string): Promise<boolean> {
    const moduleYmlPath = join(dirPath, "module.yml");
    const file = Bun.file(moduleYmlPath);
    return file.exists();
  }

  /**
   * Parse and validate a module.yml file
   */
  private async parseModuleFile(modulePath: string): Promise<Module> {
    const moduleYmlPath = join(modulePath, "module.yml");

    try {
      const content = await Bun.file(moduleYmlPath).text();
      const data = YAML.parse(content);

      // Parse and validate with Zod
      const module = parseModule(data);

      // Set the module path (not in YAML, set by loader)
      module.path = modulePath;

      // Cache the module
      this.cache.set(module.name, module);

      return module;
    } catch (error) {
      if (error instanceof Error) {
        throw new ModuleError(
          `Failed to parse module at ${modulePath}: ${error.message}`,
          modulePath,
        );
      }
      throw new ModuleError(`Failed to parse module at ${modulePath}`, modulePath);
    }
  }
}

// Default singleton instance
let defaultInstance: ModuleLoader | null = null;

/**
 * Get the default ModuleLoader instance
 * Uses the modules path from configuration
 */
export async function getModuleLoader(): Promise<ModuleLoader> {
  if (defaultInstance === null) {
    const configManager = getConfigManager();
    const config = await configManager.get();
    defaultInstance = new ModuleLoader(config.paths.modules);
  }
  return defaultInstance;
}

/**
 * Create a ModuleLoader with a specific path (for testing)
 */
export function createModuleLoader(modulesPath: string): ModuleLoader {
  return new ModuleLoader(modulesPath);
}
