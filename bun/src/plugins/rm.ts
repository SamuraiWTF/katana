/**
 * Rm plugin for removing files and directories.
 * Supports single path or array of paths.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { RmParamsSchema } from "../types/module";
import {
	BasePlugin,
	type ExecutionContext,
	type PluginResult,
} from "../types/plugin";

export class RmPlugin extends BasePlugin {
	readonly name = "rm";

	async execute(
		params: unknown,
		context: ExecutionContext,
	): Promise<PluginResult> {
		// Validate params
		const parsed = RmParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid rm params: ${parsed.error.message}`);
		}

		const paths = Array.isArray(parsed.data.path)
			? parsed.data.path
			: [parsed.data.path];

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(paths, context);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] rm: ${paths.join(", ")}`);
			return this.noop(`Would remove: ${paths.join(", ")}`);
		}

		// Real execution
		return this.executeReal(paths, context);
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		paths: string[],
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();
		let anyRemoved = false;

		for (const path of paths) {
			if (mock.fileExists(path)) {
				mock.removeFile(path);
				anyRemoved = true;
				context.logger.info(`[mock] Removed: ${path}`);
			}
		}

		if (!anyRemoved) {
			return this.noop("No files to remove");
		}

		return this.success(`Removed ${paths.length} path(s)`);
	}

	/**
	 * Execute real rm operations
	 */
	private async executeReal(
		paths: string[],
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			let anyRemoved = false;

			for (const path of paths) {
				const file = Bun.file(path);
				if (await file.exists()) {
					await Bun.$`rm -rf ${path}`.quiet();
					anyRemoved = true;
					context.logger.info(`Removed: ${path}`);
				}
			}

			if (!anyRemoved) {
				return this.noop("No files to remove");
			}

			return this.success(`Removed ${paths.length} path(s)`);
		} catch (error) {
			return this.failure(
				`rm failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
