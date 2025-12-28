/**
 * Desktop plugin for managing .desktop files and favorites.
 * Creates menu items and optionally adds to desktop favorites.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { getMockState, isMockMode } from "../core/mock-state";
import { DesktopParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

const APPLICATIONS_DIR = join(homedir(), ".local", "share", "applications");

export class DesktopPlugin extends BasePlugin {
	readonly name = "desktop";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = DesktopParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid desktop params: ${parsed.error.message}`);
		}

		const { desktop_file, filename } = parsed.data;

		// Determine action from operation context
		const isRemove = context.operation === "remove";

		// For remove, we need the filename
		if (isRemove) {
			const removeFilename = filename || desktop_file?.filename;
			if (!removeFilename) {
				return this.failure("filename required for remove operation");
			}
			return this.executeRemove(removeFilename, context);
		}

		// For install, we need desktop_file
		if (!desktop_file) {
			return this.failure("desktop_file required for install operation");
		}

		return this.executeInstall(
			desktop_file.filename,
			desktop_file.content,
			desktop_file.add_to_favorites ?? false,
			context,
		);
	}

	/**
	 * Execute install operation
	 */
	private async executeInstall(
		filename: string,
		content: string,
		addToFavorites: boolean,
		context: ExecutionContext,
	): Promise<PluginResult> {
		const desktopPath = join(APPLICATIONS_DIR, filename);

		// Mock mode
		if (context.mock || isMockMode()) {
			const mock = getMockState();
			if (mock.fileExists(desktopPath)) {
				return this.noop(`Desktop file ${filename} already exists`);
			}
			mock.writeFile(desktopPath, content);
			context.logger.info(`[mock] Created desktop file: ${filename}`);
			return this.success(`Created desktop file ${filename}`);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] desktop install: ${filename}`);
			return this.noop(`Would create desktop file ${filename}`);
		}

		// Real execution
		try {
			const file = Bun.file(desktopPath);

			// Check if already exists with same content (idempotent)
			if (await file.exists()) {
				const existingContent = await file.text();
				if (existingContent === content) {
					return this.noop(`Desktop file ${filename} already exists`);
				}
			}

			// Ensure applications directory exists
			await Bun.$`mkdir -p ${APPLICATIONS_DIR}`.quiet();

			// Write desktop file
			await Bun.write(desktopPath, content);

			// Add to favorites if requested
			if (addToFavorites) {
				await this.addToFavorites(filename, context);
			}

			context.logger.info(`Created desktop file: ${filename}`);
			return this.success(`Created desktop file ${filename}`);
		} catch (error) {
			return this.failure(
				`Desktop file creation failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Execute remove operation
	 */
	private async executeRemove(filename: string, context: ExecutionContext): Promise<PluginResult> {
		const desktopPath = join(APPLICATIONS_DIR, filename);

		// Mock mode
		if (context.mock || isMockMode()) {
			const mock = getMockState();
			if (!mock.fileExists(desktopPath)) {
				return this.noop(`Desktop file ${filename} does not exist`);
			}
			mock.removeFile(desktopPath);
			context.logger.info(`[mock] Removed desktop file: ${filename}`);
			return this.success(`Removed desktop file ${filename}`);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] desktop remove: ${filename}`);
			return this.noop(`Would remove desktop file ${filename}`);
		}

		// Real execution
		try {
			const file = Bun.file(desktopPath);

			if (!(await file.exists())) {
				return this.noop(`Desktop file ${filename} does not exist`);
			}

			// Remove from favorites first
			await this.removeFromFavorites(filename, context);

			// Remove desktop file
			await Bun.$`rm ${desktopPath}`.quiet();

			context.logger.info(`Removed desktop file: ${filename}`);
			return this.success(`Removed desktop file ${filename}`);
		} catch (error) {
			return this.failure(
				`Desktop file removal failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Add to GNOME favorites
	 */
	private async addToFavorites(filename: string, context: ExecutionContext): Promise<void> {
		try {
			// Get current favorites
			const proc = Bun.spawn(["gsettings", "get", "org.gnome.shell", "favorite-apps"], {
				stdout: "pipe",
			});
			const output = await new Response(proc.stdout).text();

			// Parse the current favorites array
			const currentFavorites = output.trim();
			const appId = filename;

			// Check if already in favorites
			if (currentFavorites.includes(appId)) {
				return;
			}

			// Add to favorites
			const newFavorites = currentFavorites.replace(/\]$/, `, '${appId}']`);
			await Bun.spawn(["gsettings", "set", "org.gnome.shell", "favorite-apps", newFavorites], {
				stdout: "pipe",
			}).exited;

			context.logger.info(`Added ${filename} to favorites`);
		} catch {
			// Silently ignore favorites errors (gsettings may not be available)
		}
	}

	/**
	 * Remove from GNOME favorites
	 */
	private async removeFromFavorites(filename: string, context: ExecutionContext): Promise<void> {
		try {
			// Get current favorites
			const proc = Bun.spawn(["gsettings", "get", "org.gnome.shell", "favorite-apps"], {
				stdout: "pipe",
			});
			const output = await new Response(proc.stdout).text();

			const appId = filename;

			// Check if in favorites
			if (!output.includes(appId)) {
				return;
			}

			// Remove from favorites using regex
			const newFavorites = output
				.replace(new RegExp(`'${appId}',?\\s*`), "")
				.replace(/,\s*\]/, "]"); // Clean up trailing comma

			await Bun.spawn(["gsettings", "set", "org.gnome.shell", "favorite-apps", newFavorites], {
				stdout: "pipe",
			}).exited;

			context.logger.info(`Removed ${filename} from favorites`);
		} catch {
			// Silently ignore favorites errors (gsettings may not be available)
		}
	}

	/**
	 * Check if desktop file exists
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = DesktopParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		const filename = parsed.data.filename || parsed.data.desktop_file?.filename;
		if (!filename) {
			return false;
		}

		const desktopPath = join(APPLICATIONS_DIR, filename);

		if (isMockMode()) {
			return getMockState().fileExists(desktopPath);
		}

		const file = Bun.file(desktopPath);
		return file.exists();
	}
}
