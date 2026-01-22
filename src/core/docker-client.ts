import type { ContainerInfo } from "../types/docker.ts";
import { DockerError, DockerNotRunningError, DockerPermissionError } from "../types/errors.ts";

/**
 * Docker client using CLI commands instead of dockerode
 * (Avoids Bun compatibility issues with native modules)
 */
export class DockerClient {
  /**
   * Check if Docker daemon is running and accessible
   */
  async ping(): Promise<boolean> {
    try {
      const proc = Bun.spawn(["docker", "info"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Check if user has Docker permissions
   * @throws DockerNotRunningError if daemon is not running
   * @throws DockerPermissionError if permission denied
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const proc = Bun.spawn(["docker", "info"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        const message = stderr.toLowerCase();

        if (
          message.includes("cannot connect") ||
          message.includes("is the docker daemon running")
        ) {
          throw new DockerNotRunningError();
        }
        if (message.includes("permission denied") || message.includes("got permission denied")) {
          throw new DockerPermissionError();
        }
        throw new DockerError(`Docker error: ${stderr}`);
      }
      return true;
    } catch (error) {
      if (error instanceof DockerError) {
        throw error;
      }
      throw new DockerError(`Failed to connect to Docker: ${error}`);
    }
  }

  /**
   * Check if a network exists
   */
  async networkExists(name: string): Promise<boolean> {
    try {
      const proc = Bun.spawn(["docker", "network", "inspect", name], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Ensure Docker network exists, creating if needed
   * @returns true if network was created, false if it already existed
   */
  async ensureNetwork(name: string): Promise<boolean> {
    const exists = await this.networkExists(name);
    if (exists) {
      return false;
    }

    try {
      const proc = Bun.spawn(["docker", "network", "create", name], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new DockerError(`Failed to create network '${name}': ${stderr}`);
      }
      return true;
    } catch (error) {
      if (error instanceof DockerError) {
        throw error;
      }
      throw new DockerError(`Failed to create network '${name}': ${error}`);
    }
  }

  /**
   * List containers with optional filters
   */
  async listContainers(options?: {
    all?: boolean;
    filters?: {
      label?: string[];
      name?: string[];
      network?: string[];
    };
  }): Promise<ContainerInfo[]> {
    try {
      const args = ["docker", "ps", "--format", "{{json .}}"];

      if (options?.all) {
        args.push("-a");
      }

      if (options?.filters?.label) {
        for (const label of options.filters.label) {
          args.push("--filter", `label=${label}`);
        }
      }
      if (options?.filters?.name) {
        for (const name of options.filters.name) {
          args.push("--filter", `name=${name}`);
        }
      }
      if (options?.filters?.network) {
        for (const network of options.filters.network) {
          args.push("--filter", `network=${network}`);
        }
      }

      const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new DockerError(`Failed to list containers: ${stderr}`);
      }

      // Parse JSON lines output
      const containers: ContainerInfo[] = [];
      const lines = stdout.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          containers.push(this.parseContainerJson(data));
        } catch {
          // Skip malformed lines
        }
      }

      return containers;
    } catch (error) {
      if (error instanceof DockerError) {
        throw error;
      }
      throw new DockerError(`Failed to list containers: ${error}`);
    }
  }

  /**
   * Get a single container by name or ID
   */
  async getContainer(nameOrId: string): Promise<ContainerInfo | null> {
    try {
      const proc = Bun.spawn(["docker", "inspect", "--format", "json", nameOrId], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return null;
      }

      const data = JSON.parse(stdout);
      if (Array.isArray(data) && data.length > 0) {
        return this.parseInspectJson(data[0]);
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Parse docker ps --format json output
   */
  private parseContainerJson(data: Record<string, unknown>): ContainerInfo {
    const state = String(data.State || "unknown").toLowerCase() as ContainerInfo["state"];
    const running = state === "running";

    // Parse RunningFor to get uptime in seconds (approximate)
    let uptime = 0;
    if (running && data.RunningFor) {
      uptime = this.parseRunningFor(String(data.RunningFor));
    }

    // Parse Labels string to object
    const labels: Record<string, string> = {};
    if (data.Labels) {
      const labelStr = String(data.Labels);
      for (const pair of labelStr.split(",")) {
        const [key, value] = pair.split("=");
        if (key) {
          labels[key] = value || "";
        }
      }
    }

    // Parse Networks
    const networks: string[] = [];
    if (data.Networks) {
      networks.push(...String(data.Networks).split(","));
    }

    return {
      id: String(data.ID || "").substring(0, 12),
      name: String(data.Names || ""),
      image: String(data.Image || ""),
      running,
      state,
      uptime,
      networks,
      labels,
    };
  }

  /**
   * Parse docker inspect output
   */
  private parseInspectJson(data: Record<string, unknown>): ContainerInfo {
    const stateData = data.State as Record<string, unknown> | undefined;
    const state = String(stateData?.Status || "unknown").toLowerCase() as ContainerInfo["state"];
    const running = stateData?.Running === true;

    // Calculate uptime from StartedAt
    let uptime = 0;
    if (running && stateData?.StartedAt) {
      const startedAt = new Date(String(stateData.StartedAt)).getTime();
      uptime = Math.floor((Date.now() - startedAt) / 1000);
    }

    // Extract networks
    const networkSettings = data.NetworkSettings as Record<string, unknown> | undefined;
    const networksObj = networkSettings?.Networks as Record<string, unknown> | undefined;
    const networks = networksObj ? Object.keys(networksObj) : [];

    // Extract labels
    const config = data.Config as Record<string, unknown> | undefined;
    const labels = (config?.Labels as Record<string, string>) || {};

    return {
      id: String(data.Id || "").substring(0, 12),
      name: String(data.Name || "").replace(/^\//, ""),
      image: String(config?.Image || ""),
      running,
      state,
      uptime,
      networks,
      labels,
    };
  }

  /**
   * Get container IP address on a specific Docker network
   * @returns IP address string or null if container not on network
   */
  async getContainerIPOnNetwork(
    containerName: string,
    networkName: string,
  ): Promise<string | null> {
    try {
      // Use index notation to handle network names with hyphens
      const formatStr = `{{index .NetworkSettings.Networks "${networkName}" "IPAddress"}}`;
      const proc = Bun.spawn(["docker", "inspect", containerName, "--format", formatStr], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return null;
      }

      const ip = stdout.trim();

      // Docker returns empty string or "<no value>" if container not on network
      if (!ip || ip === "<no value>") {
        return null;
      }

      return ip;
    } catch {
      return null;
    }
  }

  /**
   * Check if a container is running
   */
  async isContainerRunning(containerName: string): Promise<boolean> {
    try {
      const proc = Bun.spawn(
        ["docker", "inspect", containerName, "--format", "{{.State.Running}}"],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return false;
      }

      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }

  /**
   * List all Katana-managed containers (from Docker Compose projects starting with "katana-")
   */
  async listKatanaContainers(): Promise<ContainerInfo[]> {
    try {
      // List all containers (including stopped) with compose project label
      const containers = await this.listContainers({
        all: true,
        filters: {
          label: ["com.docker.compose.project"],
        },
      });

      // Filter to only katana- prefixed projects
      return containers.filter((c) => {
        const project = c.labels["com.docker.compose.project"];
        return project?.startsWith("katana-");
      });
    } catch {
      return [];
    }
  }

  /**
   * Remove a container by name or ID
   */
  async removeContainer(
    nameOrId: string,
    options?: { force?: boolean; volumes?: boolean },
  ): Promise<void> {
    const args = ["docker", "rm"];

    if (options?.force) {
      args.push("-f");
    }
    if (options?.volumes) {
      args.push("-v");
    }

    args.push(nameOrId);

    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new DockerError(`Failed to remove container '${nameOrId}': ${stderr}`);
    }
  }

  /**
   * Prune unused Docker images
   * @returns Space reclaimed in bytes (approximate)
   */
  async pruneImages(): Promise<string> {
    const proc = Bun.spawn(["docker", "image", "prune", "-f"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new DockerError(`Failed to prune images: ${stderr}`);
    }

    // Parse output for space reclaimed
    // Output format: "Total reclaimed space: 1.234GB"
    const match = stdout.match(/Total reclaimed space:\s*(.+)/);
    return match?.[1]?.trim() ?? "0B";
  }

  /**
   * Parse "X minutes ago" or "X hours ago" to seconds
   */
  private parseRunningFor(runningFor: string): number {
    const match = runningFor.match(/(\d+)\s*(second|minute|hour|day|week|month)/i);
    if (!match || !match[1] || !match[2]) return 0;

    const value = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case "second":
        return value;
      case "minute":
        return value * 60;
      case "hour":
        return value * 3600;
      case "day":
        return value * 86400;
      case "week":
        return value * 604800;
      case "month":
        return value * 2592000;
      default:
        return 0;
    }
  }
}

// Default singleton instance
let defaultInstance: DockerClient | null = null;

/**
 * Get the default DockerClient instance
 */
export function getDockerClient(): DockerClient {
  if (defaultInstance === null) {
    defaultInstance = new DockerClient();
  }
  return defaultInstance;
}
