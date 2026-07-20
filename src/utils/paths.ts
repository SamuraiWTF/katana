import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Resolve path with tilde expansion
 */
export function resolvePath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  if (path === "~") {
    return homedir();
  }
  return resolve(path);
}

/**
 * Get the config directory path
 * When running with sudo, automatically uses the original user's config directory
 */
export function getConfigDir(): string {
  // Check if running under sudo
  const sudoUser = process.env.SUDO_USER;

  if (sudoUser) {
    // Use the original user's config directory
    return `/home/${sudoUser}/.config/katana`;
  }

  // Normal case - use current user's config
  return resolvePath("~/.config/katana");
}

/**
 * Get the config file path
 * When running with sudo, automatically uses the original user's config
 */
export function getConfigPath(): string {
  return join(getConfigDir(), "config.yml");
}

/**
 * Get the data directory path
 * When running with sudo, automatically uses the original user's data directory
 */
export function getDataPath(): string {
  // Check if running under sudo
  const sudoUser = process.env.SUDO_USER;

  if (sudoUser) {
    // Use the original user's data directory
    return `/home/${sudoUser}/.local/share/katana`;
  }

  // Normal case - use current user's data
  return resolvePath("~/.local/share/katana");
}

/**
 * Get the state file path
 */
export function getStatePath(): string {
  return join(getDataPath(), "state.yml");
}

/**
 * Get the certs directory path
 */
export function getCertsPath(): string {
  return join(getDataPath(), "certs");
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(path: string): Promise<void> {
  const resolvedPath = resolvePath(path);
  const file = Bun.file(resolvedPath);

  // Check if path exists
  const exists = await file.exists();
  if (!exists) {
    // Create directory recursively
    await Bun.spawn(["mkdir", "-p", resolvedPath]).exited;
  }
}

/**
 * Ensure parent directory exists for a file path
 */
export async function ensureParentDir(filePath: string): Promise<void> {
  const dir = dirname(resolvePath(filePath));
  await ensureDir(dir);
}
