import { z } from "zod";

/**
 * Proxy configuration for routing requests to a target service
 */
export interface ProxyConfig {
  /** Hostname/subdomain (e.g., 'dvwa' - full domain computed at runtime) */
  hostname: string;

  /** Optional subdomain override for remote installs */
  hostname_remote?: string;

  /** Docker Compose service name */
  service: string;

  /** Container port to proxy to */
  port: number;
}

/**
 * Base module structure shared by all module types
 */
export interface BaseModule {
  /** Unique module name (lowercase, alphanumeric with hyphens) */
  name: string;

  /** Module category */
  category: "targets" | "tools";

  /** Human-readable description */
  description: string;

  /** Module directory path (set by loader, not in YAML) */
  path?: string;
}

/**
 * Target module (Docker Compose based)
 */
export interface TargetModule extends BaseModule {
  category: "targets";

  /** Path to compose file (relative to module dir) */
  compose: string;

  /** Proxy routing configuration */
  proxy: ProxyConfig[];

  /** Optional environment variables for compose templating */
  env?: Record<string, string>;
}

/**
 * Tool module (script based)
 */
export interface ToolModule extends BaseModule {
  category: "tools";

  /** Path to install script (relative to module dir) */
  install: string;

  /** Path to remove script (relative to module dir) */
  remove: string;

  /** Path to start script (optional) */
  start?: string;

  /** Path to stop script (optional) */
  stop?: string;

  /** Whether install requires root privileges */
  install_requires_root: boolean;
}

export type Module = TargetModule | ToolModule;

// ============================================================
// Zod Schemas for runtime validation
// ============================================================

export const ProxyConfigSchema = z.object({
  hostname: z.string().min(1, "Hostname is required"),
  hostname_remote: z.string().optional(),
  service: z.string().min(1, "Service name is required"),
  port: z.number().int().min(1).max(65535),
});

export const BaseModuleSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Module name must be lowercase alphanumeric with hyphens only"),
  category: z.enum(["targets", "tools"]),
  description: z.string().min(1, "Description is required"),
});

export const TargetModuleSchema = BaseModuleSchema.extend({
  category: z.literal("targets"),
  compose: z.string().min(1, "Compose file path is required"),
  proxy: z.array(ProxyConfigSchema).min(1, "At least one proxy configuration is required"),
  env: z.record(z.string()).optional(),
});

export const ToolModuleSchema = BaseModuleSchema.extend({
  category: z.literal("tools"),
  install: z.string().min(1, "Install script path is required"),
  remove: z.string().min(1, "Remove script path is required"),
  start: z.string().optional(),
  stop: z.string().optional(),
  install_requires_root: z.boolean().default(false),
});

export const ModuleSchema = z.discriminatedUnion("category", [
  TargetModuleSchema,
  ToolModuleSchema,
]);

/**
 * Parse and validate module data
 * @throws ZodError if validation fails
 */
export function parseModule(data: unknown): Module {
  return ModuleSchema.parse(data) as Module;
}

/**
 * Type guard to check if a module is a TargetModule
 */
export function isTargetModule(module: Module): module is TargetModule {
  return module.category === "targets";
}

/**
 * Type guard to check if a module is a ToolModule
 */
export function isToolModule(module: Module): module is ToolModule {
  return module.category === "tools";
}
