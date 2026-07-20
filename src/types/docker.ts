/**
 * Docker-related type definitions
 */

/**
 * Container status information
 */
export interface ContainerInfo {
  /** Container ID (short form) */
  id: string;

  /** Container name (without leading slash) */
  name: string;

  /** Image name with tag */
  image: string;

  /** Whether container is running */
  running: boolean;

  /** Container state */
  state: "created" | "running" | "paused" | "restarting" | "removing" | "exited" | "dead";

  /** Uptime in seconds (0 if not running) */
  uptime: number;

  /** Networks container is attached to */
  networks: string[];

  /** Container labels */
  labels: Record<string, string>;
}

/**
 * Docker Compose project status
 */
export interface ComposeStatus {
  /** Project name (e.g., katana-dvwa) */
  project: string;

  /** All containers in the project */
  containers: ContainerInfo[];

  /** True if all containers are running */
  all_running: boolean;

  /** True if any container is running */
  any_running: boolean;
}
