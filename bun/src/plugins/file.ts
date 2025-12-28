/**
 * File plugin for managing directories.
 * Creates directories or removes files/directories.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { FileParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

export class FilePlugin extends BasePlugin {
	readonly name = "file";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = FileParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid file params: ${parsed.error.message}`);
		}

		const { path, state } = parsed.data;

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(path, state, context);
		}

		// Dry run mode
		if (context.dryRun) {
			const action = state === "directory" ? "create directory" : "remove";
			context.logger.info(`[dry-run] file ${action}: ${path}`);
			return this.noop(`Would ${action} ${path}`);
		}

		// Real execution
		return this.executeReal(path, state, context);
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		path: string,
		state: "directory" | "absent",
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();

		if (state === "directory") {
			if (mock.fileExists(path) && mock.isDirectory(path)) {
				return this.noop(`Directory ${path} already exists`);
			}
			mock.createDirectory(path);
			context.logger.info(`[mock] Created directory: ${path}`);
			return this.success(`Created directory ${path}`);
		}

		// state === "absent"
		if (!mock.fileExists(path)) {
			return this.noop(`${path} does not exist`);
		}
		mock.removeFile(path);
		context.logger.info(`[mock] Removed: ${path}`);
		return this.success(`Removed ${path}`);
	}

	/**
	 * Execute real file operations
	 */
	private async executeReal(
		path: string,
		state: "directory" | "absent",
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			if (state === "directory") {
				const file = Bun.file(path);

				// Check if exists
				if (await file.exists()) {
					// Verify it's a directory using stat
					try {
						const stat = await Bun.$`test -d ${path}`.quiet();
						if (stat.exitCode === 0) {
							return this.noop(`Directory ${path} already exists`);
						}
						return this.failure(`${path} exists but is not a directory`);
					} catch {
						// test command failed, path might not be a directory
						return this.failure(`${path} exists but is not a directory`);
					}
				}

				// Create directory with parents
				await Bun.$`mkdir -p ${path}`.quiet();
				context.logger.info(`Created directory: ${path}`);
				return this.success(`Created directory ${path}`);
			}

			// state === "absent"
			const file = Bun.file(path);
			if (!(await file.exists())) {
				return this.noop(`${path} does not exist`);
			}

			// Remove file or directory
			await Bun.$`rm -rf ${path}`.quiet();
			context.logger.info(`Removed: ${path}`);
			return this.success(`Removed ${path}`);
		} catch (error) {
			return this.failure(
				`file operation failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Check if path exists
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = FileParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		if (isMockMode()) {
			return getMockState().fileExists(parsed.data.path);
		}

		const file = Bun.file(parsed.data.path);
		return file.exists();
	}
}
