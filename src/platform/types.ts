/**
 * Platform abstraction types
 * Defines interfaces for platform-specific operations
 */

/**
 * A single entry from /etc/hosts
 */
export interface HostsEntry {
  /** IP address */
  ip: string;

  /** Hostname */
  hostname: string;

  /** Whether this entry is managed by Katana */
  managed: boolean;
}

/**
 * Result of a DNS sync operation
 */
export interface DnsSyncResult {
  /** Hostnames that were added */
  added: string[];

  /** Hostnames that were removed */
  removed: string[];

  /** Hostnames that were already present */
  unchanged: string[];
}

/**
 * Interface for DNS management operations
 */
export interface IDnsManager {
  /**
   * Read all entries from the hosts file
   */
  read(): Promise<HostsEntry[]>;

  /**
   * Add a single entry to the hosts file
   * @param hostname The hostname to add
   * @param ip The IP address (default: 127.0.0.1)
   */
  addEntry(hostname: string, ip?: string): Promise<void>;

  /**
   * Remove a single entry from the hosts file
   * @param hostname The hostname to remove
   */
  removeEntry(hostname: string): Promise<void>;

  /**
   * Sync entries to match the target list
   * Adds missing entries, removes stale entries, preserves non-Katana entries
   * @param hostnames List of hostnames that should exist
   * @param ip The IP address for all entries (default: 127.0.0.1)
   */
  sync(hostnames: string[], ip?: string): Promise<DnsSyncResult>;

  /**
   * List only Katana-managed entries
   */
  listManaged(): Promise<HostsEntry[]>;

  /**
   * Get the path to the hosts file
   */
  getPath(): string;
}
