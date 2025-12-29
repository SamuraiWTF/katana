import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_USER_DATA_DIR, MODULES_SUBDIR } from "../types/config";

export interface FetchOptions {
	/** GitHub repository URL */
	repo: string;
	/** Git branch to use */
	branch: string;
	/** Target directory for katana data (default: ~/.local/share/katana) */
	targetDir?: string;
}

export interface FetchResult {
	/** Whether the operation succeeded */
	success: boolean;
	/** Path to the modules directory */
	modulesPath: string;
	/** Human-readable message */
	message: string;
	/** True if updated existing repo, false if fresh clone */
	isUpdate: boolean;
}

/**
 * Expand ~ to home directory
 */
function expandPath(path: string): string {
	if (path.startsWith("~/")) {
		return join(homedir(), path.slice(2));
	}
	return path;
}

/**
 * Get the default katana data directory
 */
function getDefaultDataDir(): string {
	return expandPath(DEFAULT_USER_DATA_DIR);
}

/**
 * ModuleFetcher handles cloning and updating modules from GitHub
 * Uses sparse checkout to only fetch the modules/ directory
 */
export class ModuleFetcher {
	/**
	 * Fetch or update modules from GitHub
	 *
	 * Uses sparse checkout to only download the modules/ directory,
	 * and shallow clone (--depth 1) for efficiency.
	 */
	async fetchModules(options: FetchOptions): Promise<FetchResult> {
		const katanaDir = options.targetDir ?? getDefaultDataDir();
		const modulesPath = join(katanaDir, MODULES_SUBDIR);
		const gitDir = join(katanaDir, ".git");

		// Check if already a git repo
		const isGitRepo = existsSync(gitDir);

		if (isGitRepo) {
			return this.updateModules(katanaDir, modulesPath, options);
		}
		return this.cloneModules(katanaDir, modulesPath, options);
	}

	/**
	 * Clone modules using sparse checkout (only modules/ directory)
	 */
	private async cloneModules(
		katanaDir: string,
		modulesPath: string,
		options: FetchOptions,
	): Promise<FetchResult> {
		try {
			// Ensure parent directory exists
			await Bun.$`mkdir -p ${katanaDir}`.quiet();

			// Initialize git repo
			await Bun.$`git -C ${katanaDir} init`.quiet();

			// Add remote
			await Bun.$`git -C ${katanaDir} remote add origin ${options.repo}`.quiet();

			// Enable sparse checkout
			await Bun.$`git -C ${katanaDir} config core.sparseCheckout true`.quiet();

			// Configure sparse checkout to only get modules/
			const sparseCheckoutFile = join(katanaDir, ".git", "info", "sparse-checkout");
			await Bun.write(sparseCheckoutFile, `${MODULES_SUBDIR}/\n`);

			// Fetch with depth 1 (shallow clone)
			await Bun.$`git -C ${katanaDir} fetch --depth 1 origin ${options.branch}`.quiet();

			// Checkout the branch
			await Bun.$`git -C ${katanaDir} checkout ${options.branch}`.quiet();

			return {
				success: true,
				modulesPath,
				message: `Modules cloned from ${options.repo} (branch: ${options.branch})`,
				isUpdate: false,
			};
		} catch (error) {
			// Clean up on failure
			try {
				await Bun.$`rm -rf ${katanaDir}`.quiet();
			} catch {
				// Ignore cleanup errors
			}

			return {
				success: false,
				modulesPath,
				message: error instanceof Error ? error.message : String(error),
				isUpdate: false,
			};
		}
	}

	/**
	 * Update existing modules repo
	 */
	private async updateModules(
		katanaDir: string,
		modulesPath: string,
		options: FetchOptions,
	): Promise<FetchResult> {
		try {
			// Fetch latest from remote
			await Bun.$`git -C ${katanaDir} fetch --depth 1 origin ${options.branch}`.quiet();

			// Reset to latest (discards any local changes)
			await Bun.$`git -C ${katanaDir} reset --hard origin/${options.branch}`.quiet();

			return {
				success: true,
				modulesPath,
				message: `Modules updated from ${options.repo} (branch: ${options.branch})`,
				isUpdate: true,
			};
		} catch {
			// If update fails, try re-cloning
			console.log("Update failed, attempting fresh clone...");

			try {
				await Bun.$`rm -rf ${katanaDir}`.quiet();
			} catch {
				// Ignore cleanup errors
			}

			return this.cloneModules(katanaDir, modulesPath, options);
		}
	}

	/**
	 * Check if a directory is a git repository
	 */
	isGitRepo(dir: string): boolean {
		const gitDir = join(dir, ".git");
		return existsSync(gitDir);
	}

	/**
	 * Get information about the current modules state
	 */
	async getModulesInfo(katanaDir: string): Promise<{ branch: string; commit: string } | null> {
		const gitDir = join(katanaDir, ".git");
		if (!existsSync(gitDir)) {
			return null;
		}

		try {
			const branch = await Bun.$`git -C ${katanaDir} rev-parse --abbrev-ref HEAD`.quiet().text();
			const commit = await Bun.$`git -C ${katanaDir} rev-parse --short HEAD`.quiet().text();

			return {
				branch: branch.trim(),
				commit: commit.trim(),
			};
		} catch {
			return null;
		}
	}
}
