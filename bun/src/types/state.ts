import { z } from "zod";

/**
 * Entry for a single installed module in installed.yml
 */
export const InstalledModuleSchema = z.object({
	/** ISO timestamp when the module was installed */
	installedAt: z.string().datetime().optional(),
	/** Version of the module (if versioning is implemented) */
	version: z.string().optional(),
});

export type InstalledModule = z.infer<typeof InstalledModuleSchema>;

/**
 * Schema for installed.yml - tracks which modules are installed
 */
export const InstalledStateSchema = z.object({
	/** Map of module name to installation metadata */
	modules: z.record(z.string(), InstalledModuleSchema).default({}),
});

export type InstalledState = z.infer<typeof InstalledStateSchema>;

/**
 * New YAML format for katana.lock with metadata
 */
export const LockFileYamlSchema = z.object({
	/** Whether lock mode is enabled */
	locked: z.boolean(),
	/** List of modules that were installed when lock was enabled */
	modules: z.array(z.string()),
	/** ISO timestamp when lock was enabled */
	lockedAt: z.string().datetime().optional(),
	/** Username or identifier of who enabled the lock */
	lockedBy: z.string().optional(),
	/** Optional message explaining why the lock was enabled */
	message: z.string().optional(),
});

export type LockFileYaml = z.infer<typeof LockFileYamlSchema>;

/**
 * Legacy format: newline-separated list of module names
 * This is detected by checking if the content is a plain string without YAML structure
 */
export const LockFileLegacySchema = z.string().transform((val) => {
	const modules = val
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
	return {
		locked: modules.length > 0,
		modules,
	} satisfies Partial<LockFileYaml>;
});

/**
 * Parsed lock file state (normalized from either format)
 */
export interface LockState {
	locked: boolean;
	modules: string[];
	lockedAt?: string;
	lockedBy?: string;
	message?: string;
}

/**
 * Default empty lock state
 */
export const EMPTY_LOCK_STATE: LockState = {
	locked: false,
	modules: [],
};

/**
 * Default empty installed state
 */
export const EMPTY_INSTALLED_STATE: InstalledState = {
	modules: {},
};
