import { DNSError, DNSPermissionError } from "../../types/errors.ts";
import type { DnsSyncResult, HostsEntry, IDnsManager } from "../types.ts";

/**
 * Marker comment used to identify Katana-managed entries
 */
const MARKER = "# katana-managed";

/**
 * Manages /etc/hosts entries on Linux
 */
export class DnsManager implements IDnsManager {
  private hostsPath: string;

  constructor(hostsPath = "/etc/hosts") {
    this.hostsPath = hostsPath;
  }

  /**
   * Read all entries from /etc/hosts
   */
  async read(): Promise<HostsEntry[]> {
    try {
      const file = Bun.file(this.hostsPath);
      const content = await file.text();
      return this.parseHostsFile(content);
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENOENT")) {
        return [];
      }
      throw new DNSError(`Failed to read hosts file: ${error}`);
    }
  }

  /**
   * Add a single entry to the hosts file
   */
  async addEntry(hostname: string, ip = "127.0.0.1"): Promise<void> {
    const entries = await this.read();

    // Check if entry already exists
    const existing = entries.find((e) => e.hostname === hostname && e.managed);
    if (existing) {
      return; // Already exists, nothing to do
    }

    // Read current content and append
    const file = Bun.file(this.hostsPath);
    let content = await file.text();

    // Ensure file ends with newline
    if (!content.endsWith("\n")) {
      content += "\n";
    }

    // Add new entry
    content += `${ip}  ${hostname}  ${MARKER}\n`;

    await this.writeHostsFile(content);
  }

  /**
   * Remove a single entry from the hosts file
   */
  async removeEntry(hostname: string): Promise<void> {
    const file = Bun.file(this.hostsPath);
    const content = await file.text();
    const lines = content.split("\n");

    const filteredLines = lines.filter((line) => {
      // Only remove Katana-managed entries matching the hostname
      if (!line.includes(MARKER)) {
        return true;
      }
      const parsed = this.parseLine(line);
      return parsed === null || parsed.hostname !== hostname;
    });

    await this.writeHostsFile(filteredLines.join("\n"));
  }

  /**
   * Sync entries to match the target list
   * Adds missing entries, removes stale entries, preserves non-Katana entries
   */
  async sync(hostnames: string[], ip = "127.0.0.1"): Promise<DnsSyncResult> {
    const result: DnsSyncResult = {
      added: [],
      removed: [],
      unchanged: [],
    };

    const file = Bun.file(this.hostsPath);
    const content = await file.text();
    const lines = content.split("\n");
    const targetSet = new Set(hostnames);

    // Track which managed hostnames we've seen
    const existingManaged = new Map<string, number>(); // hostname -> line index

    // First pass: identify existing managed entries
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line?.includes(MARKER)) {
        const parsed = this.parseLine(line);
        if (parsed?.managed) {
          existingManaged.set(parsed.hostname, i);
        }
      }
    }

    // Build new content
    const newLines: string[] = [];

    // Keep non-managed lines and managed lines that should stay
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;

      if (!line.includes(MARKER)) {
        // Not managed by Katana - preserve exactly
        newLines.push(line);
      } else {
        const parsed = this.parseLine(line);
        if (parsed && targetSet.has(parsed.hostname)) {
          // Should keep this entry
          newLines.push(line);
          result.unchanged.push(parsed.hostname);
        } else if (parsed) {
          // Should remove this entry
          result.removed.push(parsed.hostname);
          // Don't add to newLines
        }
      }
    }

    // Add missing entries
    for (const hostname of hostnames) {
      if (!existingManaged.has(hostname)) {
        // Ensure we end with a newline before adding
        const lastLine = newLines[newLines.length - 1];
        if (lastLine !== "" && newLines.length > 0) {
          // Content doesn't end with empty line, we'll add our entry after
        }
        newLines.push(`${ip}  ${hostname}  ${MARKER}`);
        result.added.push(hostname);
      }
    }

    // Ensure file ends cleanly (single trailing newline)
    let finalContent = newLines.join("\n");
    if (!finalContent.endsWith("\n")) {
      finalContent += "\n";
    }
    // Remove multiple trailing newlines
    finalContent = finalContent.replace(/\n+$/, "\n");

    await this.writeHostsFile(finalContent);

    return result;
  }

  /**
   * List only Katana-managed entries
   */
  async listManaged(): Promise<HostsEntry[]> {
    const entries = await this.read();
    return entries.filter((e) => e.managed);
  }

  /**
   * Get the path to the hosts file
   */
  getPath(): string {
    return this.hostsPath;
  }

  /**
   * Parse the hosts file content into entries
   */
  private parseHostsFile(content: string): HostsEntry[] {
    const entries: HostsEntry[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const parsed = this.parseLine(line);
      if (parsed) {
        entries.push(parsed);
      }
    }

    return entries;
  }

  /**
   * Parse a single line from the hosts file
   * Returns null for comments, empty lines, or invalid lines
   */
  private parseLine(line: string): HostsEntry | null {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      return null;
    }

    // Check if this is a pure comment line (not a managed entry)
    if (trimmed.startsWith("#") && !trimmed.includes(MARKER)) {
      return null;
    }

    // Check if this is a Katana-managed entry
    const managed = line.includes(MARKER);

    // Remove the marker comment for parsing
    const lineWithoutMarker = line.replace(MARKER, "").trim();

    // Remove any other inline comments
    const lineWithoutComments = (lineWithoutMarker.split("#")[0] ?? "").trim();

    if (!lineWithoutComments) {
      return null;
    }

    // Split on whitespace
    const parts = lineWithoutComments.split(/\s+/);

    if (parts.length < 2) {
      return null;
    }

    const [ip, hostname] = parts;

    // Basic validation
    if (!ip || !hostname) {
      return null;
    }

    return { ip, hostname, managed };
  }

  /**
   * Write content to the hosts file
   * Requires sudo for /etc/hosts
   */
  private async writeHostsFile(content: string): Promise<void> {
    try {
      // Use sudo tee to write to /etc/hosts
      const proc = Bun.spawn(["sudo", "tee", this.hostsPath], {
        stdin: new Blob([content]),
        stdout: "pipe", // Suppress tee's stdout (it echoes input)
        stderr: "pipe",
      });

      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        if (stderr.includes("permission denied") || stderr.includes("sudo")) {
          throw new DNSPermissionError();
        }
        throw new DNSError(`Failed to write hosts file: ${stderr}`);
      }
    } catch (error) {
      if (error instanceof DNSError) {
        throw error;
      }
      if (error instanceof Error && error.message.includes("sudo")) {
        throw new DNSPermissionError();
      }
      throw new DNSError(`Failed to write hosts file: ${error}`);
    }
  }
}

// Default singleton instance
let defaultInstance: DnsManager | null = null;

/**
 * Get the default DnsManager instance
 */
export function getDnsManager(): DnsManager {
  if (defaultInstance === null) {
    defaultInstance = new DnsManager();
  }
  return defaultInstance;
}
