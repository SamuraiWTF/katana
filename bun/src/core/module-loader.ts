import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { formatModuleError, type Module, type ModuleCategory, safeParseModule } from "../types";
import { type Config, DEFAULT_USER_DATA_DIR, MODULES_SUBDIR } from "../types/config";

// =============================================================================
// Types
// =============================================================================

/**
 * A loaded module with additional metadata about its source
 */
export interface LoadedModule extends Module {
	/** Absolute path to the source YAML file */
	sourcePath: string;
	/** Directory containing the module file */
	sourceDir: string;
}

/**
 * Detailed error information for module loading failures
 */
export interface ModuleLoadError {
	/** The file path that failed to load */
	filePath: string;
	/** Type of error: 'yaml_parse', 'validation', 'file_read' */
	type: "yaml_parse" | "validation" | "file_read";
	/** Human-readable error message */
	message: string;
	/** Line number if available (for YAML parse errors) */
	line?: number;
	/** Column number if available */
	column?: number;
	/** Raw error for debugging */
	cause?: unknown;
}

/**
 * Result of loading a single module - success or failure
 */
export interface ModuleLoadResult {
	success: boolean;
	module?: LoadedModule;
	error?: ModuleLoadError;
}

/**
 * Result of loading all modules
 */
export interface ModuleLoaderResult {
	/** Successfully loaded modules */
	modules: LoadedModule[];
	/** Errors encountered during loading */
	errors: ModuleLoadError[];
	/** Whether all modules loaded successfully */
	success: boolean;
}

/**
 * Options for the module loader
 */
export interface ModuleLoaderOptions {
	/** Base directory for modules (default: ../modules relative to bun/) */
	modulesDir?: string;
	/** Whether to fail on first error (default: false - collect all errors) */
	failFast?: boolean;
	/** Optional filter by category */
	category?: ModuleCategory;
	/** Whether to use cache (default: true) */
	useCache?: boolean;
}

// =============================================================================
// Custom Error for Missing Modules
// =============================================================================

export class ModulesNotFoundError extends Error {
	constructor() {
		super(
			"Modules directory not found.\n\n" +
				"Run 'katana update' to fetch modules from GitHub, or\n" +
				"Set 'modulesPath' in your config file (~/.config/katana/config.yml), or\n" +
				"Set KATANA_HOME environment variable.",
		);
		this.name = "ModulesNotFoundError";
	}
}

// =============================================================================
// Path Resolution Helpers
// =============================================================================

/**
 * Expand ~ to home directory in paths
 */
function expandPath(path: string): string {
	if (path.startsWith("~/")) {
		return join(homedir(), path.slice(2));
	}
	return path;
}

/**
 * Check if a directory exists and contains files
 */
function directoryExists(path: string): boolean {
	try {
		return existsSync(path);
	} catch {
		return false;
	}
}

/**
 * Get the default user modules directory
 */
function getDefaultUserModulesDir(): string {
	return join(expandPath(DEFAULT_USER_DATA_DIR), MODULES_SUBDIR);
}

/**
 * Get the modules directory relative to the binary location
 * Works for both compiled binary and development mode
 */
function getBinaryRelativeModulesDir(): string {
	// Bun.main gives us the path to the main script/executable
	const mainPath = Bun.main;
	const binaryDir = dirname(mainPath);

	// For compiled binary in bin/, modules would be at ../modules
	// For dev mode running src/cli.ts, go up to bun/ then to ../modules
	const possiblePaths = [
		resolve(binaryDir, "..", MODULES_SUBDIR), // bin/katana -> modules/
		resolve(binaryDir, "..", "..", MODULES_SUBDIR), // src/cli.ts -> modules/
		resolve(binaryDir, "..", "..", "..", MODULES_SUBDIR), // src/core/module-loader.ts -> modules/
	];

	for (const path of possiblePaths) {
		if (directoryExists(path)) {
			return path;
		}
	}

	// Return the first one as default (will be checked again later)
	// biome-ignore lint/style/noNonNullAssertion: We know the array has at least one element
	return possiblePaths[0]!;
}

// =============================================================================
// ModuleLoader Class
// =============================================================================

export class ModuleLoader {
	private modulesDir: string | null = null;
	private configModulesPath?: string;
	private cache: Map<string, LoadedModule> = new Map();
	private cacheTimestamp = 0;
	private cacheTTL = 5000; // 5 seconds

	private static instance: ModuleLoader | null = null;

	constructor(modulesDir?: string, configModulesPath?: string) {
		this.configModulesPath = configModulesPath;
		// If explicit modulesDir provided, use it directly
		if (modulesDir) {
			this.modulesDir = modulesDir;
		}
		// Otherwise, resolve dynamically when needed
	}

	/**
	 * Resolve modules directory with priority:
	 * 1. Explicit constructor parameter (already set in modulesDir)
	 * 2. Config file modulesPath (if set and directory exists)
	 * 3. KATANA_HOME/modules environment variable (if set and exists)
	 * 4. ~/.local/share/katana/modules (if exists)
	 * 5. ../modules relative to binary (for git clone scenario)
	 * 6. null - modules need to be fetched
	 */
	private resolveModulesDir(): string | null {
		// Already resolved
		if (this.modulesDir !== null) {
			return this.modulesDir;
		}

		// Priority 1: Config file modulesPath
		if (this.configModulesPath) {
			const expanded = expandPath(this.configModulesPath);
			if (directoryExists(expanded)) {
				this.modulesDir = expanded;
				return this.modulesDir;
			}
		}

		// Priority 2: KATANA_HOME environment variable
		const katanaHome = process.env.KATANA_HOME;
		if (katanaHome) {
			const envPath = join(katanaHome, MODULES_SUBDIR);
			if (directoryExists(envPath)) {
				this.modulesDir = envPath;
				return this.modulesDir;
			}
		}

		// Priority 3: User's local share directory
		const userModulesDir = getDefaultUserModulesDir();
		if (directoryExists(userModulesDir)) {
			this.modulesDir = userModulesDir;
			return this.modulesDir;
		}

		// Priority 4: Relative to binary (for git clone + build scenario)
		const binaryRelative = getBinaryRelativeModulesDir();
		if (directoryExists(binaryRelative)) {
			this.modulesDir = binaryRelative;
			return this.modulesDir;
		}

		// No modules found
		return null;
	}

	/**
	 * Get the resolved modules directory
	 * @throws ModulesNotFoundError if modules not available
	 */
	getModulesDir(): string {
		const dir = this.resolveModulesDir();
		if (!dir) {
			throw new ModulesNotFoundError();
		}
		return dir;
	}

	/**
	 * Check if modules are available without throwing
	 */
	hasModules(): boolean {
		return this.resolveModulesDir() !== null;
	}

	/**
	 * Get or create the singleton instance
	 * @param config Optional config to use for modulesPath
	 */
	static getInstance(config?: Config): ModuleLoader {
		if (!ModuleLoader.instance) {
			ModuleLoader.instance = new ModuleLoader(undefined, config?.modulesPath);
		}
		return ModuleLoader.instance;
	}

	/**
	 * Reset singleton (useful for testing and after module updates)
	 */
	static resetInstance(): void {
		ModuleLoader.instance = null;
	}

	/**
	 * Check if cache is still valid
	 */
	private isCacheValid(): boolean {
		return Date.now() - this.cacheTimestamp < this.cacheTTL;
	}

	/**
	 * Invalidate the cache
	 */
	invalidateCache(): void {
		this.cache.clear();
		this.cacheTimestamp = 0;
	}

	/**
	 * Discover all YAML files in the modules directory
	 * @throws ModulesNotFoundError if modules directory not available
	 */
	private async discoverModuleFiles(category?: ModuleCategory): Promise<string[]> {
		const modulesDir = this.getModulesDir(); // Throws if not available
		const pattern = category ? `${category}/*.yml` : "**/*.yml";
		const glob = new Bun.Glob(pattern);
		const files: string[] = [];

		for await (const file of glob.scan({
			cwd: modulesDir,
			absolute: true,
			onlyFiles: true,
		})) {
			files.push(file);
		}

		return files;
	}

	/**
	 * Create a file read error
	 */
	private createFileReadError(filePath: string, error: unknown): ModuleLoadError {
		return {
			filePath,
			type: "file_read",
			message: error instanceof Error ? error.message : `Failed to read file: ${filePath}`,
			cause: error,
		};
	}

	/**
	 * Create a YAML parse error with line/column info if available
	 */
	private createYamlParseError(filePath: string, error: unknown): ModuleLoadError {
		if (error instanceof YAMLParseError) {
			return {
				filePath,
				type: "yaml_parse",
				message: error.message,
				line: error.linePos?.[0]?.line,
				column: error.linePos?.[0]?.col,
				cause: error,
			};
		}
		return {
			filePath,
			type: "yaml_parse",
			message: error instanceof Error ? error.message : String(error),
			cause: error,
		};
	}

	/**
	 * Create a validation error from Zod
	 */
	private createValidationError(
		filePath: string,
		zodError: import("zod").ZodError,
	): ModuleLoadError {
		return {
			filePath,
			type: "validation",
			message: formatModuleError(zodError),
			cause: zodError,
		};
	}

	/**
	 * Load a single module from a file path
	 */
	async loadFromFile(filePath: string): Promise<ModuleLoadResult> {
		try {
			// Step 1: Read file using Bun.file
			const file = Bun.file(filePath);
			const exists = await file.exists();

			if (!exists) {
				return {
					success: false,
					error: this.createFileReadError(filePath, new Error("File not found")),
				};
			}

			const content = await file.text();

			// Step 2: Parse YAML
			let parsed: unknown;
			try {
				parsed = parseYaml(content, {
					prettyErrors: true,
				});
			} catch (error) {
				return {
					success: false,
					error: this.createYamlParseError(filePath, error),
				};
			}

			// Step 3: Validate with Zod
			const result = safeParseModule(parsed);

			if (!result.success) {
				return {
					success: false,
					error: this.createValidationError(filePath, result.error),
				};
			}

			// Step 4: Create LoadedModule with source metadata
			const loadedModule: LoadedModule = {
				...result.data,
				sourcePath: filePath,
				sourceDir: dirname(filePath),
			};

			return {
				success: true,
				module: loadedModule,
			};
		} catch (error) {
			return {
				success: false,
				error: this.createFileReadError(filePath, error),
			};
		}
	}

	/**
	 * Load all modules from the modules directory
	 */
	async loadAll(options: ModuleLoaderOptions = {}): Promise<ModuleLoaderResult> {
		const { failFast = false, category, useCache = true } = options;

		// Check cache
		if (useCache && this.isCacheValid() && this.cache.size > 0) {
			const cachedModules = Array.from(this.cache.values());
			const filtered = category
				? cachedModules.filter((m) => m.category === category)
				: cachedModules;
			return {
				modules: filtered,
				errors: [],
				success: true,
			};
		}

		// Discover files
		const files = await this.discoverModuleFiles(category);

		const modules: LoadedModule[] = [];
		const errors: ModuleLoadError[] = [];

		for (const filePath of files) {
			const result = await this.loadFromFile(filePath);

			if (result.success && result.module) {
				modules.push(result.module);
				// Update cache
				this.cache.set(result.module.name.toLowerCase(), result.module);
			} else if (result.error) {
				errors.push(result.error);
				if (failFast) {
					break;
				}
			}
		}

		// Update cache timestamp
		this.cacheTimestamp = Date.now();

		return {
			modules,
			errors,
			success: errors.length === 0,
		};
	}

	/**
	 * Load a single module by name (case-insensitive)
	 */
	async loadByName(name: string): Promise<ModuleLoadResult> {
		const normalizedName = name.toLowerCase();

		// Check cache first
		if (this.cache.has(normalizedName) && this.isCacheValid()) {
			return {
				success: true,
				module: this.cache.get(normalizedName),
			};
		}

		// Load all to populate cache, then retrieve
		await this.loadAll();

		const module = this.cache.get(normalizedName);
		if (module) {
			return { success: true, module };
		}

		return {
			success: false,
			error: {
				filePath: "",
				type: "file_read",
				message: `Module not found: ${name}`,
			},
		};
	}

	/**
	 * Get all module names (useful for CLI tab completion)
	 */
	async getModuleNames(): Promise<string[]> {
		const result = await this.loadAll();
		return result.modules.map((m) => m.name);
	}

	/**
	 * Get modules grouped by category
	 */
	async getModulesByCategory(): Promise<Map<ModuleCategory, LoadedModule[]>> {
		const result = await this.loadAll();
		const byCategory = new Map<ModuleCategory, LoadedModule[]>();

		for (const module of result.modules) {
			const existing = byCategory.get(module.category) ?? [];
			existing.push(module);
			byCategory.set(module.category, existing);
		}

		return byCategory;
	}

	/**
	 * Validate a YAML file without caching
	 */
	async validateFile(filePath: string): Promise<ModuleLoadResult> {
		return this.loadFromFile(filePath);
	}
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Load all modules using the singleton instance
 */
export async function loadAllModules(options?: ModuleLoaderOptions): Promise<ModuleLoaderResult> {
	return ModuleLoader.getInstance().loadAll(options);
}

/**
 * Load a single module by name using the singleton instance
 */
export async function loadModule(name: string): Promise<ModuleLoadResult> {
	return ModuleLoader.getInstance().loadByName(name);
}

/**
 * Validate a module YAML file
 */
export async function validateModuleFile(filePath: string): Promise<ModuleLoadResult> {
	return ModuleLoader.getInstance().validateFile(filePath);
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format a ModuleLoadError into a human-readable string for CLI output
 */
export function formatModuleLoadError(error: ModuleLoadError): string {
	const location = error.line
		? ` at line ${error.line}${error.column ? `:${error.column}` : ""}`
		: "";

	const typeLabel = {
		yaml_parse: "YAML Parse Error",
		validation: "Validation Error",
		file_read: "File Read Error",
	}[error.type];

	return `${typeLabel} in ${error.filePath}${location}:\n  ${error.message}`;
}

/**
 * Format all errors from a ModuleLoaderResult
 */
export function formatModuleLoaderErrors(result: ModuleLoaderResult): string {
	if (result.errors.length === 0) return "";

	return result.errors.map(formatModuleLoadError).join("\n\n");
}
