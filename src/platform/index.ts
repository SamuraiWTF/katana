import { KatanaError } from "../types/errors.ts";
import { type DnsManager, getDnsManager as getLinuxDnsManager } from "./linux/dns-manager.ts";

/**
 * Supported platforms
 */
export type Platform = "linux";

/**
 * Error thrown when running on an unsupported platform
 */
export class UnsupportedPlatformError extends KatanaError {
  constructor(platform: string) {
    super(`Unsupported platform: ${platform}`, "UNSUPPORTED_PLATFORM");
    this.name = "UnsupportedPlatformError";
  }

  override help() {
    return "Katana currently only supports Linux";
  }
}

/**
 * Get the current platform
 * @throws UnsupportedPlatformError if platform is not supported
 */
export function getPlatform(): Platform {
  const platform = process.platform;

  if (platform === "linux") {
    return "linux";
  }

  throw new UnsupportedPlatformError(platform);
}

/**
 * Check if the current platform is supported
 */
export function isPlatformSupported(): boolean {
  try {
    getPlatform();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the DNS manager for the current platform
 */
export function getDnsManager(): DnsManager {
  const platform = getPlatform();

  switch (platform) {
    case "linux":
      return getLinuxDnsManager();
    default:
      // This should never happen due to getPlatform() throwing
      throw new UnsupportedPlatformError(platform);
  }
}

// Re-export types
export type { HostsEntry, DnsSyncResult, IDnsManager } from "./types.ts";
export { DnsManager } from "./linux/dns-manager.ts";
