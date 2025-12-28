/**
 * Git plugin for cloning repositories.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { GitParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

export class GitPlugin extends BasePlugin {
	readonly name = "git";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = GitParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid git params: ${parsed.error.message}`);
		}

		const { repo, dest } = parsed.data;

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(repo, dest, context);
		}

		// Dry run mode
		if (context.dryRun) {
			context.logger.info(`[dry-run] git clone ${repo} -> ${dest}`);
			return this.noop(`Would clone ${repo} to ${dest}`);
		}

		// Real execution
		return this.executeReal(repo, dest, context);
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		repo: string,
		dest: string,
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();

		// Idempotent: if already cloned, noop
		if (mock.repoExists(dest)) {
			return this.noop(`Repository already exists at ${dest}`);
		}

		mock.cloneRepo(repo, dest);
		context.logger.info(`[mock] Cloned ${repo} to ${dest}`);
		return this.success(`Cloned ${repo} to ${dest}`);
	}

	/**
	 * Execute real git clone
	 */
	private async executeReal(
		repo: string,
		dest: string,
		context: ExecutionContext,
	): Promise<PluginResult> {
		try {
			const file = Bun.file(dest);

			// Idempotent: if destination exists, assume already cloned
			if (await file.exists()) {
				// Check if it's a git repo
				const gitDir = Bun.file(`${dest}/.git`);
				if (await gitDir.exists()) {
					// Could do git pull here, but for idempotency just noop
					return this.noop(`Repository already exists at ${dest}`);
				}
				return this.failure(`${dest} exists but is not a git repository`);
			}

			// Ensure parent directory exists
			const parentDir = dest.substring(0, dest.lastIndexOf("/"));
			if (parentDir) {
				await Bun.$`mkdir -p ${parentDir}`.quiet();
			}

			// Clone repository
			context.logger.info(`git clone ${repo} ${dest}`);
			const proc = Bun.spawn(["git", "clone", repo, dest], {
				stdout: "pipe",
				stderr: "pipe",
			});

			const exitCode = await proc.exited;
			const stderr = await new Response(proc.stderr).text();

			if (exitCode !== 0) {
				return this.failure(`git clone failed: ${stderr.trim()}`);
			}

			return this.success(`Cloned ${repo} to ${dest}`);
		} catch (error) {
			return this.failure(
				`git clone failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Check if repository exists at destination
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = GitParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		if (isMockMode()) {
			return getMockState().repoExists(parsed.data.dest);
		}

		const gitDir = Bun.file(`${parsed.data.dest}/.git`);
		return gitDir.exists();
	}
}
