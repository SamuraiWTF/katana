/**
 * Copy plugin for writing content to files.
 * Creates files with specified content and optional mode.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { CopyParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

export class CopyPlugin extends BasePlugin {
	readonly name = "copy";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = CopyParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid copy params: ${parsed.error.message}`);
		}

		const { dest, content, mode } = parsed.data;

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(dest, content, mode, context);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] copy: write to ${dest}`);
			return this.noop(`Would write content to ${dest}`);
		}

		// Real execution
		return this.executeReal(dest, content, mode, context);
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		dest: string,
		content: string,
		mode: string | undefined,
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();
		const changed = mock.writeFile(dest, content, mode);

		if (!changed) {
			return this.noop(`File ${dest} already has the same content`);
		}

		context.logger.info(`[mock] Wrote content to: ${dest}`);
		return this.success(`Wrote content to ${dest}`);
	}

	/**
	 * Execute real file operations
	 */
	private async executeReal(
		dest: string,
		content: string,
		mode: string | undefined,
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			const file = Bun.file(dest);

			// Check if content is the same (idempotent)
			if (await file.exists()) {
				const existingContent = await file.text();
				if (existingContent === content) {
					return this.noop(`File ${dest} already has the same content`);
				}
			}

			// Ensure parent directory exists
			const parentDir = dest.substring(0, dest.lastIndexOf("/"));
			if (parentDir) {
				await Bun.$`mkdir -p ${parentDir}`.quiet();
			}

			// Write content
			await Bun.write(dest, content);

			// Set mode if specified
			if (mode) {
				await Bun.$`chmod ${mode} ${dest}`.quiet();
			}

			context.logger.info(`Wrote content to: ${dest}`);
			return this.success(`Wrote content to ${dest}`);
		} catch (error) {
			return this.failure(`copy failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Check if file exists
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = CopyParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		if (isMockMode()) {
			return getMockState().fileExists(parsed.data.dest);
		}

		const file = Bun.file(parsed.data.dest);
		return file.exists();
	}
}
