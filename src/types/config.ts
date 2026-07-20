import { z } from "zod";

/**
 * Main configuration schema
 */
export const ConfigSchema = z.object({
  /** Installation type: local or remote */
  install_type: z.enum(["local", "remote"]).default("local"),

  /** Base domain for remote installs (e.g., lab01.training.example.com) */
  base_domain: z.string().optional(),

  /** Local domain suffix for local installs */
  local_domain: z.string().default("samurai.wtf"),

  /** Dashboard hostname */
  dashboard_hostname: z.string().default("katana"),

  /** Paths configuration */
  paths: z
    .object({
      modules: z.string().default("./modules"),
      data: z.string().default("~/.local/share/katana"),
      certs: z.string().default("~/.local/share/katana/certs"),
      state: z.string().default("~/.local/share/katana/state.yml"),
    })
    .default({}),

  /** Proxy configuration */
  proxy: z
    .object({
      http_port: z.number().int().min(1).max(65535).default(80),
      https_port: z.number().int().min(1).max(65535).default(443),
      bind_address: z.string().ip().optional(),
    })
    .default({}),

  /** Docker network name */
  docker_network: z.string().default("katana-net"),
});

/**
 * Inferred Config type from schema
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Config = {
  install_type: "local",
  local_domain: "samurai.wtf",
  dashboard_hostname: "katana",
  paths: {
    modules: "./modules",
    data: "~/.local/share/katana",
    certs: "~/.local/share/katana/certs",
    state: "~/.local/share/katana/state.yml",
  },
  proxy: {
    http_port: 80,
    https_port: 443,
    bind_address: undefined,
  },
  docker_network: "katana-net",
};

/**
 * Validate and parse config data
 */
export function parseConfig(data: unknown): Config {
  return ConfigSchema.parse(data);
}

/**
 * Get the full hostname for a target
 */
export function getTargetHostname(config: Config, targetHostname: string): string {
  if (config.install_type === "remote" && config.base_domain) {
    return `${targetHostname}.${config.base_domain}`;
  }
  return `${targetHostname}.${config.local_domain}`;
}

/**
 * Get the dashboard full hostname
 */
export function getDashboardHostname(config: Config): string {
  return getTargetHostname(config, config.dashboard_hostname);
}

/**
 * Get the bind address for the proxy server
 * Defaults based on install_type:
 * - Local installs: 127.0.0.1 (localhost only)
 * - Remote installs: 0.0.0.0 (all interfaces)
 */
export function getBindAddress(config: Config): string {
  // Explicit config overrides default behavior
  if (config.proxy.bind_address) {
    return config.proxy.bind_address;
  }

  // Smart defaults based on install type
  if (config.install_type === "remote") {
    return "0.0.0.0"; // All interfaces for remote access
  }

  return "127.0.0.1"; // Localhost only for local installs
}
