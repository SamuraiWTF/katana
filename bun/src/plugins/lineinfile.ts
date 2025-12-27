/**
 * Lineinfile plugin for adding/removing lines in files.
 * Ensures a specific line is present or absent in a file.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { LineinfileParamsSchema } from "../types/module";
import {
	BasePlugin,
	type ExecutionContext,
	type PluginResult,
} from "../types/plugin";

export class LineinfilePlugin extends BasePlugin {
	readonly name = "lineinfile";

	async execute(
		params: unknown,
		context: ExecutionContext,
	): Promise<PluginResult> {
		// Validate params
		const parsed = LineinfileParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid lineinfile params: ${parsed.error.message}`);
		}

		const { dest, line, state } = parsed.data;

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(dest, line, state, context);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] lineinfile ${state}: "${line}" in ${dest}`);
			return this.noop(`Would ${state === "present" ? "add" : "remove"} line in ${dest}`);
		}

		// Real execution
		return this.executeReal(dest, line, state, context);
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		dest: string,
		line: string,
		state: "present" | "absent",
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();

		if (state === "present") {
			if (mock.hasLine(dest, line)) {
				return this.noop(`Line already present in ${dest}`);
			}
			mock.addLine(dest, line);
			context.logger.info(`[mock] Added line to ${dest}`);
			return this.success(`Added line to ${dest}`);
		}

		// state === "absent"
		if (!mock.hasLine(dest, line)) {
			return this.noop(`Line not present in ${dest}`);
		}
		mock.removeLine(dest, line);
		context.logger.info(`[mock] Removed line from ${dest}`);
		return this.success(`Removed line from ${dest}`);
	}

	/**
	 * Execute real file operations
	 */
	private async executeReal(
		dest: string,
		line: string,
		state: "present" | "absent",
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			const file = Bun.file(dest);
			let content = "";

			// Read existing content if file exists
			if (await file.exists()) {
				content = await file.text();
			}

			const lines = content.split("\n");
			const lineExists = lines.includes(line);

			if (state === "present") {
				if (lineExists) {
					return this.noop(`Line already present in ${dest}`);
				}

				// Add line at the end
				lines.push(line);
				const newContent = lines.join("\n");
				await Bun.write(dest, newContent);
				context.logger.info(`Added line to ${dest}`);
				return this.success(`Added line to ${dest}`);
			}

			// state === "absent"
			if (!lineExists) {
				return this.noop(`Line not present in ${dest}`);
			}

			// Remove all occurrences of the line
			const newLines = lines.filter((l) => l !== line);
			const newContent = newLines.join("\n");
			await Bun.write(dest, newContent);
			context.logger.info(`Removed line from ${dest}`);
			return this.success(`Removed line from ${dest}`);
		} catch (error) {
			return this.failure(
				`lineinfile failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
