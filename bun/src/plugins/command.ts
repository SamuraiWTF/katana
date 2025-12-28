/**
 * Command plugin for running shell commands.
 */

import { isMockMode } from "../core/mock-state";
import { CommandParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

export class CommandPlugin extends BasePlugin {
	readonly name = "command";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = CommandParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid command params: ${parsed.error.message}`);
		}

		const { cmd, cwd, unsafe, shell } = parsed.data;

		// Safety check - require unsafe flag for potentially dangerous commands
		if (!unsafe && this.isDangerous(cmd)) {
			return this.failure(`Command appears dangerous. Set unsafe: true to execute: ${cmd}`);
		}

		// Mock mode - just log and succeed
		if (context.mock || isMockMode()) {
			context.logger.info(`[mock] Would run: ${cmd}`);
			return this.success(`[mock] ${cmd}`);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] command: ${cmd}`);
			return this.noop(`Would run: ${cmd}`);
		}

		// Real execution
		return this.executeReal(cmd, cwd, shell ?? false, context);
	}

	/**
	 * Check if command appears dangerous
	 */
	private isDangerous(cmd: string): boolean {
		const dangerousPatterns = [
			/\brm\s+-rf?\s+\//, // rm -r /
			/\brm\s+-rf?\s+\*/, // rm -r *
			/\bdd\s+.*of=\/dev\//, // dd to device
			/\bmkfs/, // format filesystem
			/\b:\(\)\s*\{/, // fork bomb
			/\bchmod\s+-R\s+777\s+\//, // chmod 777 /
			/\bchown\s+-R\s+.*\s+\/\s*$/, // chown -R /
		];

		return dangerousPatterns.some((pattern) => pattern.test(cmd));
	}

	/**
	 * Execute real command
	 */
	private async executeReal(
		cmd: string,
		cwd: string | undefined,
		shell: boolean,
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			context.logger.info(`Running: ${cmd}`);

			let proc: ReturnType<typeof Bun.spawn>;

			if (shell) {
				// Run through shell
				proc = Bun.spawn(["sh", "-c", cmd], {
					stdout: "pipe",
					stderr: "pipe",
					cwd: cwd,
				});
			} else {
				// Parse command into args
				const args = this.parseCommand(cmd);
				proc = Bun.spawn(args, {
					stdout: "pipe",
					stderr: "pipe",
					cwd: cwd,
				});
			}

			const exitCode = await proc.exited;
			const stdout = await new Response(proc.stdout as ReadableStream).text();
			const stderr = await new Response(proc.stderr as ReadableStream).text();

			if (exitCode !== 0) {
				const error = stderr.trim() || stdout.trim() || `Exit code: ${exitCode}`;
				return this.failure(`Command failed: ${error}`);
			}

			return this.success(`Command completed: ${cmd}`);
		} catch (error) {
			return this.failure(
				`Command failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Parse a command string into arguments.
	 * Handles simple quoting but for complex commands use shell: true
	 */
	private parseCommand(cmd: string): string[] {
		const args: string[] = [];
		let current = "";
		let inQuote = false;
		let quoteChar = "";

		for (const char of cmd) {
			if (inQuote) {
				if (char === quoteChar) {
					inQuote = false;
				} else {
					current += char;
				}
			} else if (char === '"' || char === "'") {
				inQuote = true;
				quoteChar = char;
			} else if (char === " " || char === "\t") {
				if (current) {
					args.push(current);
					current = "";
				}
			} else {
				current += char;
			}
		}

		if (current) {
			args.push(current);
		}

		return args;
	}
}
