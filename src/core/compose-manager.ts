import { join } from "node:path";
import type { ComposeStatus, ContainerInfo } from "../types/docker.ts";
import { DockerError } from "../types/errors.ts";
import type { TargetModule } from "../types/module.ts";
import { getConfigManager } from "./config-manager.ts";
import { type DockerClient, getDockerClient } from "./docker-client.ts";

/**
 * Manages Docker Compose operations for target modules
 */
export class ComposeManager {
  private docker: DockerClient;
  private network: string;

  constructor(network: string) {
    this.docker = getDockerClient();
    this.network = network;
  }

  /**
   * Ensure the shared Docker network exists
   */
  async ensureNetwork(): Promise<void> {
    const created = await this.docker.ensureNetwork(this.network);
    if (created) {
      console.log(`Created Docker network: ${this.network}`);
    }
  }

  /**
   * Get the compose project name for a module
   * Convention: katana-<module-name>
   */
  getProjectName(moduleName: string): string {
    return `katana-${moduleName}`;
  }

  /**
   * Render compose template with environment variables
   * Returns path to the rendered file (or original if no templating needed)
   */
  async renderTemplate(module: TargetModule, vars: Record<string, string>): Promise<string> {
    if (!module.path) {
      throw new DockerError("Module path not set");
    }
    const composePath = join(module.path, module.compose);
    const template = await Bun.file(composePath).text();

    // Check if template contains any ${VAR} patterns
    if (!template.includes("${")) {
      return composePath; // No templating needed
    }

    // Perform variable substitution
    let rendered = template;
    for (const [key, value] of Object.entries(vars)) {
      rendered = rendered.replaceAll(`\${${key}}`, value);
    }

    // Write rendered file alongside the original
    const renderedPath = join(module.path, "compose.rendered.yml");
    await Bun.write(renderedPath, rendered);
    return renderedPath;
  }

  /**
   * Start a compose project (docker compose up -d)
   */
  async up(module: TargetModule, envOverride?: Record<string, string>): Promise<void> {
    // Ensure network exists first
    await this.ensureNetwork();

    // Determine compose file path (render if needed)
    // Use override if provided, otherwise fall back to module.env
    const env = envOverride ?? module.env ?? {};
    const composePath = await this.renderTemplate(module, env);
    const projectName = this.getProjectName(module.name);

    // Run docker compose up (--no-start to create containers without starting)
    const proc = Bun.spawn(
      ["docker", "compose", "-f", composePath, "-p", projectName, "up", "-d", "--no-start"],
      {
        cwd: module.path,
        stdout: "inherit",
        stderr: "inherit",
      },
    );

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new DockerError(`docker compose up failed with exit code ${exitCode}`);
    }
  }

  /**
   * Stop and remove a compose project (docker compose down)
   */
  async down(moduleName: string, modulePath: string): Promise<void> {
    const projectName = this.getProjectName(moduleName);

    // Try rendered file first, fall back to compose.yml
    let composePath = join(modulePath, "compose.rendered.yml");
    if (!(await Bun.file(composePath).exists())) {
      composePath = join(modulePath, "compose.yml");
    }

    const proc = Bun.spawn(["docker", "compose", "-f", composePath, "-p", projectName, "down"], {
      cwd: modulePath,
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new DockerError(`docker compose down failed with exit code ${exitCode}`);
    }

    // Clean up rendered file if it exists
    const renderedPath = join(modulePath, "compose.rendered.yml");
    if (await Bun.file(renderedPath).exists()) {
      await Bun.spawn(["rm", renderedPath]).exited;
    }
  }

  /**
   * Start stopped containers (docker compose start)
   */
  async start(moduleName: string, modulePath: string): Promise<void> {
    const projectName = this.getProjectName(moduleName);

    // Try rendered file first, fall back to compose.yml
    let composePath = join(modulePath, "compose.rendered.yml");
    if (!(await Bun.file(composePath).exists())) {
      composePath = join(modulePath, "compose.yml");
    }

    const proc = Bun.spawn(["docker", "compose", "-f", composePath, "-p", projectName, "start"], {
      cwd: modulePath,
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new DockerError(`docker compose start failed with exit code ${exitCode}`);
    }
  }

  /**
   * Stop running containers (docker compose stop)
   */
  async stop(moduleName: string, modulePath: string): Promise<void> {
    const projectName = this.getProjectName(moduleName);

    // Try rendered file first, fall back to compose.yml
    let composePath = join(modulePath, "compose.rendered.yml");
    if (!(await Bun.file(composePath).exists())) {
      composePath = join(modulePath, "compose.yml");
    }

    const proc = Bun.spawn(["docker", "compose", "-f", composePath, "-p", projectName, "stop"], {
      cwd: modulePath,
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new DockerError(`docker compose stop failed with exit code ${exitCode}`);
    }
  }

  /**
   * Get project status by querying Docker for containers
   */
  async status(moduleName: string): Promise<ComposeStatus> {
    const projectName = this.getProjectName(moduleName);

    // Query containers by compose project label
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: [`com.docker.compose.project=${projectName}`],
      },
    });

    const allRunning = containers.length > 0 && containers.every((c: ContainerInfo) => c.running);
    const anyRunning = containers.some((c: ContainerInfo) => c.running);

    return {
      project: projectName,
      containers,
      all_running: allRunning,
      any_running: anyRunning,
    };
  }

  /**
   * Stream logs from a compose project
   */
  async logs(
    moduleName: string,
    modulePath: string,
    options?: { follow?: boolean; tail?: number },
  ): Promise<void> {
    const projectName = this.getProjectName(moduleName);

    // Try rendered file first, fall back to compose.yml
    let composePath = join(modulePath, "compose.rendered.yml");
    if (!(await Bun.file(composePath).exists())) {
      composePath = join(modulePath, "compose.yml");
    }

    const args = ["docker", "compose", "-f", composePath, "-p", projectName, "logs"];

    if (options?.follow) {
      args.push("--follow");
    }
    if (options?.tail !== undefined) {
      args.push("--tail", options.tail.toString());
    }

    const proc = Bun.spawn(args, {
      cwd: modulePath,
      stdout: "inherit",
      stderr: "inherit",
    });

    await proc.exited;
  }

  /**
   * List all Katana-managed compose projects
   */
  async listProjects(): Promise<string[]> {
    // Query all containers with katana compose project prefix
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: ["com.docker.compose.project"],
      },
    });

    // Extract unique project names that start with 'katana-'
    const projects = new Set<string>();
    for (const container of containers) {
      const project = container.labels["com.docker.compose.project"];
      if (project?.startsWith("katana-")) {
        projects.add(project);
      }
    }

    return Array.from(projects);
  }
}

// Default singleton instance
let defaultInstance: ComposeManager | null = null;

/**
 * Get the default ComposeManager instance
 */
export async function getComposeManager(): Promise<ComposeManager> {
  if (defaultInstance === null) {
    const configManager = getConfigManager();
    const config = await configManager.get();
    defaultInstance = new ComposeManager(config.docker_network);
  }
  return defaultInstance;
}
