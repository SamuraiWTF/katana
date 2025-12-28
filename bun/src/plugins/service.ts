/**
 * Service plugin for managing systemd services.
 * Supports start, stop, and restart operations.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { ServiceParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

export class ServicePlugin extends BasePlugin {
	readonly name = "service";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = ServiceParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid service params: ${parsed.error.message}`);
		}

		const { name, state } = parsed.data;

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(name, state, context);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] systemctl: ${state} ${name}`);
			return this.noop(`Would ${state} service ${name}`);
		}

		// Real execution
		return this.executeReal(name, state, context);
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		name: string,
		state: "running" | "stopped" | "restarted",
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();

		switch (state) {
			case "running": {
				if (mock.serviceRunning(name)) {
					return this.noop(`Service ${name} already running`);
				}
				mock.startService(name);
				context.logger.info(`[mock] Started service: ${name}`);
				return this.success(`Started service ${name}`);
			}

			case "stopped": {
				if (!mock.serviceRunning(name)) {
					return this.noop(`Service ${name} already stopped`);
				}
				mock.stopService(name);
				context.logger.info(`[mock] Stopped service: ${name}`);
				return this.success(`Stopped service ${name}`);
			}

			case "restarted": {
				mock.restartService(name);
				context.logger.info(`[mock] Restarted service: ${name}`);
				return this.success(`Restarted service ${name}`);
			}

			default:
				return this.failure(`Unknown service state: ${state}`);
		}
	}

	/**
	 * Execute real systemctl commands
	 */
	private async executeReal(
		name: string,
		state: "running" | "stopped" | "restarted",
		context: ExecutionContext,
	): Promise<PluginResult> {
		switch (state) {
			case "running": {
				// Check if already running (idempotent)
				if (await this.serviceRunning(name)) {
					return this.noop(`Service ${name} already running`);
				}
				return this.runSystemctl("start", name, context);
			}

			case "stopped": {
				// Check if already stopped (idempotent)
				if (!(await this.serviceRunning(name))) {
					return this.noop(`Service ${name} already stopped`);
				}
				return this.runSystemctl("stop", name, context);
			}

			case "restarted": {
				// Restart always changes state
				return this.runSystemctl("restart", name, context);
			}

			default:
				return this.failure(`Unknown service state: ${state}`);
		}
	}

	/**
	 * Run a systemctl command and return result
	 */
	private async runSystemctl(
		action: string,
		name: string,
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			context.logger.info(`systemctl ${action} ${name}`);

			const proc = Bun.spawn(["systemctl", action, name], {
				stdout: "pipe",
				stderr: "pipe",
			});

			const exitCode = await proc.exited;
			const stderr = await new Response(proc.stderr).text();

			if (exitCode !== 0) {
				return this.failure(`systemctl ${action} ${name} failed: ${stderr.trim()}`);
			}

			return this.success(`systemctl ${action} ${name}`);
		} catch (error) {
			return this.failure(
				`systemctl command failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Check if a service exists
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = ServiceParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		if (isMockMode()) {
			return getMockState().serviceExists(parsed.data.name);
		}

		return this.serviceExists(parsed.data.name);
	}

	/**
	 * Check if a service is running
	 */
	async started(params: unknown): Promise<boolean> {
		const parsed = ServiceParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		if (isMockMode()) {
			return getMockState().serviceRunning(parsed.data.name);
		}

		return this.serviceRunning(parsed.data.name);
	}

	/**
	 * Check if a service exists (real systemctl)
	 */
	private async serviceExists(name: string): Promise<boolean> {
		try {
			const proc = Bun.spawn(["systemctl", "list-unit-files", `${name}.service`, "--no-legend"], {
				stdout: "pipe",
			});
			const output = await new Response(proc.stdout).text();
			return output.trim().length > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Check if a service is running (real systemctl)
	 */
	private async serviceRunning(name: string): Promise<boolean> {
		try {
			const proc = Bun.spawn(["systemctl", "is-active", name], {
				stdout: "pipe",
			});
			const output = await new Response(proc.stdout).text();
			return output.trim() === "active";
		} catch {
			return false;
		}
	}
}
