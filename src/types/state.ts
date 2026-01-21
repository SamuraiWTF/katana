import { z } from "zod";

/**
 * Proxy route schema
 */
export const ProxyRouteSchema = z.object({
  /** Hostname (e.g., dvwa.test) */
  hostname: z.string(),

  /** Docker service name */
  service: z.string(),

  /** Container port */
  port: z.number().int().min(1).max(65535),
});

export type ProxyRoute = z.infer<typeof ProxyRouteSchema>;

/**
 * Target state schema
 */
export const TargetStateSchema = z.object({
  /** Module name */
  name: z.string(),

  /** Installation timestamp (ISO 8601) */
  installed_at: z.string().datetime(),

  /** Docker Compose project name */
  compose_project: z.string(),

  /** Registered proxy routes */
  routes: z.array(ProxyRouteSchema),
});

export type TargetState = z.infer<typeof TargetStateSchema>;

/**
 * Tool state schema
 */
export const ToolStateSchema = z.object({
  /** Module name */
  name: z.string(),

  /** Installation timestamp (ISO 8601) */
  installed_at: z.string().datetime(),

  /** Tool version (if available) */
  version: z.string().optional(),
});

export type ToolState = z.infer<typeof ToolStateSchema>;

/**
 * Main state schema
 */
export const StateSchema = z.object({
  /** Lock status - prevents install/remove when true */
  locked: z.boolean().default(false),

  /** Last state update timestamp (ISO 8601) */
  last_updated: z.string().datetime(),

  /** Installed targets */
  targets: z.array(TargetStateSchema).default([]),

  /** Installed tools */
  tools: z.array(ToolStateSchema).default([]),
});

export type State = z.infer<typeof StateSchema>;

/**
 * Create an empty state object
 */
export function createEmptyState(): State {
  return {
    locked: false,
    last_updated: new Date().toISOString(),
    targets: [],
    tools: [],
  };
}

/**
 * Validate and parse state data
 */
export function parseState(data: unknown): State {
  return StateSchema.parse(data);
}
