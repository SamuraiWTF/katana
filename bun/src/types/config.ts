import { z } from "zod";

/**
 * Server configuration schema
 */
export const ServerConfigSchema = z.object({
	/** Port to listen on */
	port: z.number().int().min(1).max(65535).default(8087),
	/** Host to bind to */
	host: z.string().default("127.0.0.1"),
	/** Enable CORS for development */
	cors: z.boolean().default(false),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Logging configuration schema
 */
export const LogConfigSchema = z.object({
	/** Log level */
	level: z.enum(["debug", "info", "warn", "error"]).default("info"),
	/** Log format: json for production, pretty for development */
	format: z.enum(["json", "pretty"]).default("pretty"),
	/** Log file path (optional, logs to stdout if not set) */
	file: z.string().optional(),
});

export type LogConfig = z.infer<typeof LogConfigSchema>;

/**
 * Main configuration schema for /etc/katana/config.yml
 */
export const ConfigSchema = z.object({
	/** Path to modules directory (resolved dynamically if not set) */
	modulesPath: z.string().optional(),
	/** GitHub repository URL for fetching modules */
	modulesRepo: z.string().default("https://github.com/SamuraiWTF/katana"),
	/** Git branch to use when fetching/updating modules */
	modulesBranch: z.string().default("main"),
	/** Path to state directory (installed.yml, katana.lock) */
	statePath: z.string().default("/var/lib/katana"),
	/** Base domain for module URLs (e.g., 'test' -> dvwa.test) */
	domainBase: z.string().default("test"),
	/** Server configuration */
	server: ServerConfigSchema.optional().transform((val) => ServerConfigSchema.parse(val ?? {})),
	/** Logging configuration */
	log: LogConfigSchema.optional().transform((val) => LogConfigSchema.parse(val ?? {})),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});

/**
 * Configuration file paths in order of precedence
 */
export const CONFIG_PATHS = [
	"/etc/katana/config.yml",
	"~/.config/katana/config.yml",
	"./config.yml",
] as const;

/**
 * Default user data directory for modules (used when modulesPath not configured)
 */
export const DEFAULT_USER_DATA_DIR = "~/.local/share/katana";

/**
 * Default modules subdirectory name
 */
export const MODULES_SUBDIR = "modules";
