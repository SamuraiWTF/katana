/**
 * Replace plugin for regex-based text replacement in files.
 */

import { isMockMode } from "../core/mock-state";
import { ReplaceParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

export class ReplacePlugin extends BasePlugin {
	readonly name = "replace";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = ReplaceParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid replace params: ${parsed.error.message}`);
		}

		const { path, regexp, replace } = parsed.data;

		// Mock mode - just log and succeed
		if (context.mock || isMockMode()) {
			context.logger.info(`[mock] Replace in ${path}: /${regexp}/ -> "${replace}"`);
			return this.success(`[mock] Replaced pattern in ${path}`);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] replace: /${regexp}/ -> "${replace}" in ${path}`);
			return this.noop(`Would replace pattern in ${path}`);
		}

		// Real execution
		return this.executeReal(path, regexp, replace, context);
	}

	/**
	 * Execute real replacement
	 */
	private async executeReal(
		path: string,
		regexpStr: string,
		replaceStr: string,
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			const file = Bun.file(path);

			if (!(await file.exists())) {
				return this.failure(`File does not exist: ${path}`);
			}

			const content = await file.text();
			const regex = new RegExp(regexpStr, "g");

			// Check if there are any matches
			if (!regex.test(content)) {
				return this.noop(`No matches found for pattern in ${path}`);
			}

			// Reset regex after test
			regex.lastIndex = 0;

			// Perform replacement
			const newContent = content.replace(regex, replaceStr);

			// Check if anything changed (idempotent)
			if (content === newContent) {
				return this.noop(`File ${path} already has the replacement`);
			}

			await Bun.write(path, newContent);
			context.logger.info(`Replaced pattern in ${path}`);
			return this.success(`Replaced pattern in ${path}`);
		} catch (error) {
			return this.failure(
				`Replace failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
