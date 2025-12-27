#!/usr/bin/env bun
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { stringify as yamlStringify } from "yaml";
import {
	formatModuleLoadError,
	formatModuleLoaderErrors,
	loadAllModules,
	loadModule,
	validateModuleFile,
} from "./core/module-loader";
import { StateManager } from "./core/state-manager";
import type { ModuleCategory } from "./types";
import { ConfigSchema, DEFAULT_CONFIG } from "./types/config";

const program = new Command();

program.name("katana").version("0.1.0").description("Module deployment and management CLI");

// =============================================================================
// Implemented Commands
// =============================================================================

program
	.command("list")
	.description("List available modules")
	.argument("[category]", "Filter by category (targets, tools, network, system)")
	.action(async (category?: string) => {
		try {
			// Check lock state
			const stateManager = StateManager.getInstance();
			const lockState = await stateManager.getLockState();

			// Show lock banner if locked
			if (lockState.locked) {
				const lockMsg = lockState.message
					? `System is locked: ${lockState.message}`
					: "System is locked";
				console.log("");
				console.log(`[LOCKED] ${lockMsg}`);
			}

			const loaderOptions = category ? { category: category as ModuleCategory } : {};
			const result = await loadAllModules(loaderOptions);

			if (!result.success && result.modules.length === 0) {
				console.error(formatModuleLoaderErrors(result));
				process.exit(1);
			}

			// Filter to locked modules if in lock mode
			let modules = result.modules;
			if (lockState.locked) {
				const lockedNames = new Set(lockState.modules.map((m) => m.toLowerCase()));
				modules = modules.filter((m) => lockedNames.has(m.name.toLowerCase()));
			}

			if (modules.length === 0) {
				if (lockState.locked) {
					console.log("");
					console.log("No installed modules" + (category ? ` in category: ${category}` : ""));
				} else {
					console.log(category ? `No modules found in category: ${category}` : "No modules found");
				}
				return;
			}

			// Print header
			console.log("");
			console.log(`${"NAME".padEnd(25)} ${"CATEGORY".padEnd(12)} DESCRIPTION`);
			console.log(`${"-".repeat(25)} ${"-".repeat(12)} ${"-".repeat(40)}`);

			// Sort and print modules
			const sorted = modules.sort((a, b) => a.name.localeCompare(b.name));
			for (const mod of sorted) {
				const desc = mod.description?.slice(0, 50) || "";
				console.log(`${mod.name.padEnd(25)} ${mod.category.padEnd(12)} ${desc}`);
			}

			console.log("");
			if (lockState.locked) {
				console.log(`Total: ${modules.length} installed module(s)`);
			} else {
				console.log(`Total: ${modules.length} module(s)`);
			}

			// Show errors if any modules failed to load
			if (result.errors.length > 0) {
				console.error("");
				console.error(`Warning: ${result.errors.length} module(s) failed to load`);
			}
		} catch (error) {
			console.error("Error loading modules:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

program
	.command("validate")
	.description("Validate a module YAML file")
	.argument("<file>", "Path to the module YAML file")
	.action(async (file: string) => {
		try {
			const filePath = resolve(file);
			const result = await validateModuleFile(filePath);

			if (result.success && result.module) {
				console.log(`Valid: ${result.module.name} (${result.module.category})`);
				if (result.module.description) {
					console.log(`  ${result.module.description}`);
				}
			} else if (result.error) {
				console.error(formatModuleLoadError(result.error));
				process.exit(1);
			}
		} catch (error) {
			console.error("Error validating file:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

program
	.command("status")
	.description("Check module status")
	.argument("<module>", "Module name")
	.action(async (moduleName: string) => {
		try {
			const result = await loadModule(moduleName);

			if (result.success && result.module) {
				const stateManager = StateManager.getInstance();
				const status = await stateManager.getModuleStatus(moduleName);

				console.log(`Module: ${result.module.name}`);
				console.log(`Category: ${result.module.category}`);
				if (result.module.description) {
					console.log(`Description: ${result.module.description}`);
				}
				console.log("");
				console.log(`Status: ${status}`);

				// Show installation info if installed
				const installInfo = await stateManager.getModuleInstallInfo(moduleName);
				if (installInfo?.installedAt) {
					console.log(`Installed: ${installInfo.installedAt}`);
				}
			} else if (result.error) {
				console.error(formatModuleLoadError(result.error));
				process.exit(1);
			}
		} catch (error) {
			console.error("Error checking status:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

// =============================================================================
// Stub Commands (for future phases)
// =============================================================================

const stubAction = (command: string) => () => {
	console.log(`'${command}' is not yet implemented`);
	console.log("This feature will be available in a future version.");
};

// =============================================================================
// Init Command
// =============================================================================

interface InitOptions {
	user?: boolean;
	path?: string;
	nonInteractive?: boolean;
	domainBase?: string;
	port?: number;
	modulesPath?: string;
	force?: boolean;
}

/**
 * Expand ~ to home directory in path
 */
function expandPath(path: string): string {
	if (path.startsWith("~/")) {
		return path.replace("~", homedir());
	}
	return path;
}

/**
 * Prompt user for input with a default value
 */
async function promptWithDefault(
	rl: ReturnType<typeof createInterface>,
	message: string,
	defaultValue: string,
): Promise<string> {
	const answer = await rl.question(`${message} [${defaultValue}]: `);
	return answer.trim() || defaultValue;
}

/**
 * Prompt user for yes/no confirmation
 */
async function promptConfirm(
	rl: ReturnType<typeof createInterface>,
	message: string,
	defaultValue = false,
): Promise<boolean> {
	const defaultStr = defaultValue ? "Y/n" : "y/N";
	const answer = await rl.question(`${message} [${defaultStr}]: `);
	const trimmed = answer.trim().toLowerCase();
	if (trimmed === "") return defaultValue;
	return trimmed === "y" || trimmed === "yes";
}

program
	.command("init")
	.description("Initialize katana configuration")
	.option("--user", "Write to user config (~/.config/katana/config.yml)")
	.option("--path <path>", "Custom output path for config file")
	.option("--non-interactive", "Skip interactive prompts, use defaults or provided values")
	.option("--domain-base <base>", "Base domain for module URLs (e.g., 'test' -> dvwa.test)")
	.option("--port <port>", "Server port", Number.parseInt)
	.option("--modules-path <path>", "Path to modules directory")
	.option("--force", "Overwrite existing config file without prompting")
	.action(async (options: InitOptions) => {
		try {
			// Determine output path
			let outputPath: string;
			if (options.path) {
				outputPath = expandPath(options.path);
			} else if (options.user) {
				outputPath = expandPath("~/.config/katana/config.yml");
			} else {
				outputPath = "/etc/katana/config.yml";
			}

			// Check if file exists
			const file = Bun.file(outputPath);
			const exists = await file.exists();

			let domainBase = options.domainBase ?? DEFAULT_CONFIG.domainBase;
			let port = options.port ?? DEFAULT_CONFIG.server.port;
			let modulesPath = options.modulesPath ?? DEFAULT_CONFIG.modulesPath;
			let shouldWrite = true;

			if (options.nonInteractive) {
				// Non-interactive mode
				if (exists && !options.force) {
					console.error(`Error: Config file already exists at ${outputPath}`);
					console.error("Use --force to overwrite.");
					process.exit(1);
				}
			} else {
				// Interactive mode
				const rl = createInterface({
					input: process.stdin,
					output: process.stdout,
				});

				try {
					console.log("");
					console.log("Katana Configuration Setup");
					console.log("==========================");
					console.log("");

					// Check if file exists and prompt to overwrite
					if (exists && !options.force) {
						const overwrite = await promptConfirm(
							rl,
							`Config file already exists at ${outputPath}. Overwrite?`,
							false,
						);
						if (!overwrite) {
							console.log("Aborted.");
							shouldWrite = false;
						}
					}

					if (shouldWrite) {
						// Prompt for values (use provided options as defaults if given)
						domainBase = await promptWithDefault(
							rl,
							"Base domain for module URLs",
							options.domainBase ?? DEFAULT_CONFIG.domainBase,
						);

						const portStr = await promptWithDefault(
							rl,
							"Server port",
							String(options.port ?? DEFAULT_CONFIG.server.port),
						);
						port = Number.parseInt(portStr, 10);
						if (Number.isNaN(port) || port < 1 || port > 65535) {
							console.error("Invalid port number. Using default.");
							port = DEFAULT_CONFIG.server.port;
						}

						modulesPath = await promptWithDefault(
							rl,
							"Path to modules directory",
							options.modulesPath ?? DEFAULT_CONFIG.modulesPath,
						);

						console.log("");
					}
				} finally {
					rl.close();
				}
			}

			if (!shouldWrite) {
				return;
			}

			// Build config object
			const config = {
				modulesPath,
				statePath: DEFAULT_CONFIG.statePath,
				domainBase,
				server: {
					port,
					host: DEFAULT_CONFIG.server.host,
					cors: DEFAULT_CONFIG.server.cors,
				},
				log: {
					level: DEFAULT_CONFIG.log.level,
					format: DEFAULT_CONFIG.log.format,
				},
			};

			// Validate config
			const result = ConfigSchema.safeParse(config);
			if (!result.success) {
				console.error("Error: Invalid configuration values");
				for (const issue of result.error.issues) {
					console.error(`  ${issue.path.join(".")}: ${issue.message}`);
				}
				process.exit(1);
			}

			// Create parent directories
			const parentDir = dirname(outputPath);
			const parentFile = Bun.file(parentDir);
			if (!(await parentFile.exists())) {
				await Bun.$`mkdir -p ${parentDir}`.quiet();
			}

			// Write config file
			const yamlContent = yamlStringify(config);
			await Bun.write(outputPath, yamlContent);

			console.log(`Configuration saved to ${outputPath}`);
			console.log("");
			console.log("Settings:");
			console.log(`  Domain base: ${domainBase}`);
			console.log(`  Server port: ${port}`);
			console.log(`  Modules path: ${modulesPath}`);
		} catch (error) {
			console.error("Error initializing config:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

program
	.command("install")
	.description("Install a module")
	.argument("<module>", "Module name to install")
	.action(stubAction("install"));

program
	.command("remove")
	.description("Remove a module")
	.argument("<module>", "Module name to remove")
	.action(stubAction("remove"));

program
	.command("start")
	.description("Start module services")
	.argument("<module>", "Module name to start")
	.action(stubAction("start"));

program
	.command("stop")
	.description("Stop module services")
	.argument("<module>", "Module name to stop")
	.action(stubAction("stop"));

program
	.command("lock")
	.description("Enable lock mode (prevent changes)")
	.option("-m, --message <message>", "Lock message explaining the reason")
	.action(async (options: { message?: string }) => {
		try {
			const stateManager = StateManager.getInstance();

			// Check if already locked
			if (await stateManager.isLocked()) {
				const state = await stateManager.getLockState();
				console.log("System is already locked.");
				if (state.lockedBy) {
					console.log(`Locked by: ${state.lockedBy}`);
				}
				if (state.message) {
					console.log(`Reason: ${state.message}`);
				}
				return;
			}

			await stateManager.enableLock({
				message: options.message,
				lockedBy: process.env.USER ?? "unknown",
			});

			const installed = await stateManager.getInstalledModuleNames();
			console.log("Lock mode enabled.");
			console.log(`Locked modules: ${installed.length > 0 ? installed.join(", ") : "(none)"}`);
		} catch (error) {
			console.error("Error enabling lock:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

program
	.command("unlock")
	.description("Disable lock mode (allow changes)")
	.action(async () => {
		try {
			const stateManager = StateManager.getInstance();

			// Check if not locked
			if (!(await stateManager.isLocked())) {
				console.log("System is not locked.");
				return;
			}

			await stateManager.disableLock();
			console.log("Lock mode disabled.");
		} catch (error) {
			console.error("Error disabling lock:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

program.command("update").description("Update installed modules").action(stubAction("update"));

// =============================================================================
// Parse and run
// =============================================================================

program.parse();
