/**
 * Unarchive plugin for downloading and extracting tar.gz files.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { UnarchiveParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

export class UnarchivePlugin extends BasePlugin {
	readonly name = "unarchive";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = UnarchiveParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid unarchive params: ${parsed.error.message}`);
		}

		const { url, dest, cleanup } = parsed.data;

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(url, dest, context);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] unarchive: ${url} -> ${dest}`);
			return this.noop(`Would extract ${url} to ${dest}`);
		}

		// Real execution
		return this.executeReal(url, dest, cleanup ?? false, context);
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

		// Idempotent: if destination exists, noop
		if (mock.fileExists(dest)) {
			return this.noop(`Destination already exists at ${dest}`);
		}

		mock.createDirectory(dest);
		context.logger.info(`[mock] Extracted ${url} to ${dest}`);
		return this.success(`Extracted ${url} to ${dest}`);
	}

	/**
	 * Execute real download and extract
	 */
	private async executeReal(
		url: string,
		dest: string,
		cleanup: boolean,
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			const destFile = Bun.file(dest);

			// Idempotent: if destination exists, noop
			if (await destFile.exists()) {
				return this.noop(`Destination already exists at ${dest}`);
			}

			// Ensure parent directory exists
			await Bun.$`mkdir -p ${dest}`.quiet();

			// Create temp file for download
			const tempPath = `/tmp/unarchive-${Date.now()}.tar.gz`;

			context.logger.info(`Downloading ${url}`);

			// Download the archive
			const response = await fetch(url);
			if (!response.ok) {
				return this.failure(`Download failed: HTTP ${response.status}`);
			}

			const buffer = await response.arrayBuffer();
			await Bun.write(tempPath, buffer);

			// Extract the archive
			context.logger.info(`Extracting to ${dest}`);

			const proc = Bun.spawn(["tar", "-xzf", tempPath, "-C", dest, "--strip-components=1"], {
				stdout: "pipe",
				stderr: "pipe",
			});

			const exitCode = await proc.exited;
			if (exitCode !== 0) {
				const stderr = await new Response(proc.stderr).text();
				await Bun.$`rm -f ${tempPath}`.quiet();
				return this.failure(`Extraction failed: ${stderr.trim()}`);
			}

			// Cleanup temp file
			if (cleanup) {
				await Bun.$`rm -f ${tempPath}`.quiet();
			}

			return this.success(`Extracted ${url} to ${dest}`);
		} catch (error) {
			return this.failure(
				`Unarchive failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Check if extracted directory exists
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = UnarchiveParamsSchema.safeParse(params);
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
