/**
 * GetUrl plugin for downloading files from URLs.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { GetUrlParamsSchema } from "../types/module";
import {
	BasePlugin,
	type ExecutionContext,
	type PluginResult,
} from "../types/plugin";

export class GetUrlPlugin extends BasePlugin {
	readonly name = "get_url";

	async execute(
		params: unknown,
		context: ExecutionContext,
	): Promise<PluginResult> {
		// Validate params
		const parsed = GetUrlParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid get_url params: ${parsed.error.message}`);
		}

		const { url, dest } = parsed.data;

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(url, dest, context);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] get_url: ${url} -> ${dest}`);
			return this.noop(`Would download ${url} to ${dest}`);
		}

		// Real execution
		return this.executeReal(url, dest, context);
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		url: string,
		dest: string,
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();

		// Idempotent: if file exists, noop
		if (mock.fileExists(dest)) {
			return this.noop(`File already exists at ${dest}`);
		}

		mock.writeFile(dest, `[mock download from ${url}]`);
		context.logger.info(`[mock] Downloaded ${url} to ${dest}`);
		return this.success(`Downloaded ${url} to ${dest}`);
	}

	/**
	 * Execute real download
	 */
	private async executeReal(
		url: string,
		dest: string,
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			const file = Bun.file(dest);

			// Idempotent: if file exists, noop
			if (await file.exists()) {
				return this.noop(`File already exists at ${dest}`);
			}

			// Ensure parent directory exists
			const parentDir = dest.substring(0, dest.lastIndexOf("/"));
			if (parentDir) {
				await Bun.$`mkdir -p ${parentDir}`.quiet();
			}

			context.logger.info(`Downloading ${url} to ${dest}`);

			// Download using fetch
			const response = await fetch(url);
			if (!response.ok) {
				return this.failure(`Download failed: HTTP ${response.status}`);
			}

			const buffer = await response.arrayBuffer();
			await Bun.write(dest, buffer);

			return this.success(`Downloaded ${url} to ${dest}`);
		} catch (error) {
			return this.failure(
				`Download failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Check if downloaded file exists
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = GetUrlParamsSchema.safeParse(params);
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
