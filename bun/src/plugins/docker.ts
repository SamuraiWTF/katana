/**
 * Docker plugin for managing containers.
 * Supports pull, run, start, stop, and rm operations.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { DockerParamsSchema } from "../types/module";
import {
	BasePlugin,
	type ExecutionContext,
	type PluginResult,
} from "../types/plugin";

type DockerAction = "pull" | "run" | "start" | "stop" | "rm";

export class DockerPlugin extends BasePlugin {
	readonly name = "docker";

	async execute(
		params: unknown,
		context: ExecutionContext,
	): Promise<PluginResult> {
		// Validate params
		const parsed = DockerParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid docker params: ${parsed.error.message}`);
		}

		const { name, image, ports } = parsed.data;
		const action = this.inferAction(context.operation, !!image);

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(action, name, image, ports, context);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] docker ${action}: ${name}`);
			return this.noop(`Would ${action} container ${name}`);
		}

		// Real execution
		return this.executeReal(action, name, image, ports, context);
	}

	/**
	 * Infer the docker action based on operation context and params
	 */
	private inferAction(operation: string, hasImage: boolean): DockerAction {
		switch (operation) {
			case "remove":
				return "rm";
			case "stop":
				return "stop";
			case "start":
				return hasImage ? "run" : "start";
			case "install":
			default:
				return hasImage ? "run" : "start";
		}
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		action: DockerAction,
		name: string,
		image: string | undefined,
		ports: Record<string, number> | undefined,
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();

		switch (action) {
			case "pull":
				context.logger.info(`[mock] Pulled image: ${image}`);
				return this.success(`Pulled ${image}`);

			case "run": {
				// Idempotent: if container exists and running, noop
				if (mock.containerExists(name)) {
					if (mock.containerRunning(name)) {
						return this.noop(`Container ${name} already running`);
					}
					// Exists but not running, start it
					mock.startContainer(name);
					return this.success(`Started existing container ${name}`);
				}
				// Create and start
				mock.createContainer(name, image ?? "unknown", ports ?? {});
				mock.startContainer(name);
				context.logger.info(`[mock] Created and started container: ${name}`);
				return this.success(`Created and started container ${name}`);
			}

			case "start": {
				if (!mock.containerExists(name)) {
					return this.failure(`Container ${name} does not exist`);
				}
				if (mock.containerRunning(name)) {
					return this.noop(`Container ${name} already running`);
				}
				mock.startContainer(name);
				context.logger.info(`[mock] Started container: ${name}`);
				return this.success(`Started container ${name}`);
			}

			case "stop": {
				if (!mock.containerExists(name)) {
					return this.noop(`Container ${name} does not exist`);
				}
				if (!mock.containerRunning(name)) {
					return this.noop(`Container ${name} not running`);
				}
				mock.stopContainer(name);
				context.logger.info(`[mock] Stopped container: ${name}`);
				return this.success(`Stopped container ${name}`);
			}

			case "rm": {
				if (!mock.containerExists(name)) {
					return this.noop(`Container ${name} does not exist`);
				}
				// Stop first if running
				if (mock.containerRunning(name)) {
					mock.stopContainer(name);
				}
				mock.removeContainer(name);
				context.logger.info(`[mock] Removed container: ${name}`);
				return this.success(`Removed container ${name}`);
			}

			default:
				return this.failure(`Unknown docker action: ${action}`);
		}
	}

	/**
	 * Execute real docker commands
	 */
	private async executeReal(
		action: DockerAction,
		name: string,
		image: string | undefined,
		ports: Record<string, number> | undefined,
		context: ExecutionContext,
	): Promise<PluginResult> {
		switch (action) {
			case "pull":
				if (!image) {
					return this.failure("Image required for pull");
				}
				return this.runDocker(["pull", image], context);

			case "run": {
				if (!image) {
					return this.failure("Image required for run");
				}

				// Idempotent: check if container exists
				if (await this.containerExists(name)) {
					if (await this.containerRunning(name)) {
						return this.noop(`Container ${name} already running`);
					}
					// Exists but not running, start it
					return this.runDocker(["start", name], context);
				}

				// Build docker run command
				const args = ["run", "-d", "--name", name];
				if (ports) {
					for (const [containerPort, hostPort] of Object.entries(ports)) {
						// Handle port format like "80/tcp" -> "80"
						const port = containerPort.replace("/tcp", "").replace("/udp", "");
						args.push("-p", `${hostPort}:${port}`);
					}
				}
				args.push(image);
				return this.runDocker(args, context);
			}

			case "start": {
				if (await this.containerRunning(name)) {
					return this.noop(`Container ${name} already running`);
				}
				if (!(await this.containerExists(name))) {
					return this.failure(`Container ${name} does not exist`);
				}
				return this.runDocker(["start", name], context);
			}

			case "stop": {
				if (!(await this.containerExists(name))) {
					return this.noop(`Container ${name} does not exist`);
				}
				if (!(await this.containerRunning(name))) {
					return this.noop(`Container ${name} not running`);
				}
				return this.runDocker(["stop", name], context);
			}

			case "rm": {
				if (!(await this.containerExists(name))) {
					return this.noop(`Container ${name} does not exist`);
				}
				// Stop first if running
				if (await this.containerRunning(name)) {
					const stopResult = await this.runDocker(["stop", name], context);
					if (!stopResult.success) {
						return stopResult;
					}
				}
				return this.runDocker(["rm", name], context);
			}

			default:
				return this.failure(`Unknown docker action: ${action}`);
		}
	}

	/**
	 * Run a docker command and return result
	 */
	private async runDocker(
		args: string[],
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			context.logger.info(`docker ${args.join(" ")}`);

			const proc = Bun.spawn(["docker", ...args], {
				stdout: "pipe",
				stderr: "pipe",
			});

			const exitCode = await proc.exited;
			const stderr = await new Response(proc.stderr).text();

			if (exitCode !== 0) {
				return this.failure(`docker ${args[0]} failed: ${stderr.trim()}`);
			}

			return this.success(`docker ${args.join(" ")}`);
		} catch (error) {
			return this.failure(
				`Docker command failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Check if a container exists
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = DockerParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		if (isMockMode()) {
			return getMockState().containerExists(parsed.data.name);
		}

		return this.containerExists(parsed.data.name);
	}

	/**
	 * Check if a container is running
	 */
	async started(params: unknown): Promise<boolean> {
		const parsed = DockerParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		if (isMockMode()) {
			return getMockState().containerRunning(parsed.data.name);
		}

		return this.containerRunning(parsed.data.name);
	}

	/**
	 * Check if a container exists (real docker)
	 */
	private async containerExists(name: string): Promise<boolean> {
		try {
			const proc = Bun.spawn(
				["docker", "ps", "-a", "--filter", `name=^${name}$`, "--format", "{{.Names}}"],
				{ stdout: "pipe" },
			);
			const output = await new Response(proc.stdout).text();
			return output.trim() === name;
		} catch {
			return false;
		}
	}

	/**
	 * Check if a container is running (real docker)
	 */
	private async containerRunning(name: string): Promise<boolean> {
		try {
			const proc = Bun.spawn(
				[
					"docker",
					"ps",
					"--filter",
					`name=^${name}$`,
					"--filter",
					"status=running",
					"--format",
					"{{.Names}}",
				],
				{ stdout: "pipe" },
			);
			const output = await new Response(proc.stdout).text();
			return output.trim() === name;
		} catch {
			return false;
		}
	}
}
