#!/usr/bin/env bun
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { stringify as yamlStringify } from "yaml";
import { DependencyResolver } from "./core/dependencies";
import { allSucceeded, getChanges, getFailures, TaskExecutor } from "./core/executor";
import {
	formatModuleLoadError,
	formatModuleLoaderErrors,
	loadAllModules,
	loadModule,
	validateModuleFile,
} from "./core/module-loader";
import { StateManager } from "./core/state-manager";
import { StatusChecker } from "./core/status";
import { getPluginRegistry } from "./plugins/registry";
import type { ModuleCategory, Operation, Task } from "./types";
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
	.option("--status", "Show real-time status for each module")
	.action(async (category?: string, options?: { status?: boolean }) => {
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

			// Get status for all modules if --status flag is set
			let statusMap: Map<string, import("./core/status").StatusResult> | null = null;
			if (options?.status) {
				const statusChecker = new StatusChecker();
				statusMap = await statusChecker.checkStatusBatch(modules);
			}

			// Print header (with STATUS column if checking status)
			console.log("");
			if (statusMap) {
				console.log(
					`${"NAME".padEnd(25)} ${"CATEGORY".padEnd(12)} ${"STATUS".padEnd(20)} DESCRIPTION`,
				);
				console.log(`${"-".repeat(25)} ${"-".repeat(12)} ${"-".repeat(20)} ${"-".repeat(30)}`);
			} else {
				console.log(`${"NAME".padEnd(25)} ${"CATEGORY".padEnd(12)} DESCRIPTION`);
				console.log(`${"-".repeat(25)} ${"-".repeat(12)} ${"-".repeat(40)}`);
			}

			// Sort and print modules
			const sorted = modules.sort((a, b) => a.name.localeCompare(b.name));
			for (const mod of sorted) {
				const desc = mod.description?.slice(0, statusMap ? 30 : 50) || "";
				if (statusMap) {
					const statusResult = statusMap.get(mod.name.toLowerCase());
					const statusStr = statusResult ? StatusChecker.formatStatus(statusResult) : "unknown";
					console.log(
						`${mod.name.padEnd(25)} ${mod.category.padEnd(12)} ${statusStr.padEnd(20)} ${desc}`,
					);
				} else {
					console.log(`${mod.name.padEnd(25)} ${mod.category.padEnd(12)} ${desc}`);
				}
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
				console.log(`Module: ${result.module.name}`);
				console.log(`Category: ${result.module.category}`);
				if (result.module.description) {
					console.log(`Description: ${result.module.description}`);
				}
				console.log("");

				// Use StatusChecker for real status if module has status checks
				if (result.module.status?.installed || result.module.status?.running) {
					const statusChecker = new StatusChecker();
					const statusResult = await statusChecker.checkStatus(result.module);
					console.log(`Status: ${StatusChecker.formatStatus(statusResult)}`);
				} else {
					// Fall back to state manager for modules without status checks
					const stateManager = StateManager.getInstance();
					const status = await stateManager.getModuleStatus(moduleName);
					console.log(`Status: ${status}`);
				}

				// Show dependencies if present
				const deps = result.module["depends-on"];
				if (deps && deps.length > 0) {
					console.log(`Dependencies: ${deps.join(", ")}`);
				}

				// Show installation info if installed
				const stateManager = StateManager.getInstance();
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

// =============================================================================
// Module Operation Commands (install, remove, start, stop)
// =============================================================================

interface ModuleOperationOptions {
	dryRun?: boolean;
}

/**
 * Execute tasks for a single module (helper for executeModuleOperation)
 */
async function executeModuleTasks(
	moduleName: string,
	operation: Operation,
	options: ModuleOperationOptions,
	stateManager: StateManager,
): Promise<boolean> {
	const result = await loadModule(moduleName);
	if (!result.success || !result.module) {
		if (result.error) {
			console.error(formatModuleLoadError(result.error));
		} else {
			console.error(`Module not found: ${moduleName}`);
		}
		return false;
	}

	const mod = result.module;
	const tasks = mod[operation] as Task[] | undefined;

	if (!tasks || tasks.length === 0) {
		console.log(`Module ${moduleName} has no ${operation} tasks`);
		return true;
	}

	// Load plugins
	const registry = getPluginRegistry();
	await registry.loadBuiltinPlugins();

	// Create executor with progress events
	const executor = new TaskExecutor({
		dryRun: options.dryRun,
	});

	// Subscribe to events for progress output
	executor.on("task:start", (task, index, total) => {
		const taskName =
			"name" in task && typeof task.name === "string" ? task.name : `Task ${index + 1}`;
		process.stdout.write(`[${index + 1}/${total}] ${taskName}...`);
	});

	executor.on("task:complete", (task, taskResult, _index, _total) => {
		if (taskResult.success) {
			const status = taskResult.changed ? "ok" : "unchanged";
			console.log(` ${status}`);
		} else {
			console.log(` FAILED`);
			if (taskResult.message) {
				console.error(`    Error: ${taskResult.message}`);
			}
		}
	});

	executor.on("task:error", (_task, error, _index, _total) => {
		console.log(` ERROR`);
		console.error(`    ${error.message}`);
	});

	// Execute tasks
	const verbMap: Record<Operation, string> = {
		install: "Installing",
		remove: "Removing",
		start: "Starting",
		stop: "Stopping",
	};
	console.log(`${verbMap[operation]} ${moduleName}...`);
	console.log("");

	const results = await executor.execute(tasks, operation);

	// Summary
	console.log("");
	const changes = getChanges(results);
	const failures = getFailures(results);

	if (allSucceeded(results)) {
		if (options.dryRun) {
			console.log(`Dry run complete. ${changes.length} task(s) would make changes.`);
		} else {
			console.log(`${operation.charAt(0).toUpperCase() + operation.slice(1)} complete.`);
			console.log(`${changes.length} task(s) made changes.`);

			// Update state on successful install/remove
			if (operation === "install") {
				await stateManager.installModule(moduleName);
			} else if (operation === "remove") {
				await stateManager.removeModule(moduleName);
			}
		}
		return true;
	}

	console.error(`${operation.charAt(0).toUpperCase() + operation.slice(1)} failed.`);
	console.error(`${failures.length} task(s) failed.`);
	return false;
}

/**
 * Execute a module operation (install/remove/start/stop)
 */
async function executeModuleOperation(
	moduleName: string,
	operation: Operation,
	options: ModuleOperationOptions = {},
): Promise<void> {
	// Load module to verify it exists
	const result = await loadModule(moduleName);
	if (!result.success || !result.module) {
		if (result.error) {
			console.error(formatModuleLoadError(result.error));
		} else {
			console.error(`Module not found: ${moduleName}`);
		}
		process.exit(1);
	}

	// Check lock mode
	const stateManager = StateManager.getInstance();
	const isLocked = await stateManager.isLocked();

	if (isLocked && operation !== "start" && operation !== "stop") {
		const lockState = await stateManager.getLockState();
		console.error("System is locked. Cannot modify modules.");
		if (lockState.message) {
			console.error(`Reason: ${lockState.message}`);
		}
		console.error("Use 'katana unlock' to disable lock mode.");
		process.exit(1);
	}

	console.log("");

	// Handle dependencies for install
	if (operation === "install") {
		const allModulesResult = await loadAllModules();
		const resolver = new DependencyResolver(allModulesResult.modules);

		// Resolve installation order
		const resolution = resolver.getInstallOrder(moduleName);
		if (!resolution.success) {
			for (const error of resolution.errors) {
				console.error(`Dependency error: ${error.message}`);
			}
			process.exit(1);
		}

		// Install dependencies first (in order), skipping already installed
		const statusChecker = new StatusChecker();
		for (const depName of resolution.order) {
			if (depName.toLowerCase() === moduleName.toLowerCase()) continue;

			// Check if already installed
			const depModule = allModulesResult.modules.find(
				(m) => m.name.toLowerCase() === depName.toLowerCase(),
			);
			if (depModule) {
				const status = await statusChecker.checkStatus(depModule);
				if (status.installed) {
					console.log(`Dependency ${depName} already installed, skipping\n`);
					continue;
				}
			}

			// Install dependency (fail-fast)
			console.log(`Installing dependency: ${depName}\n`);
			const success = await executeModuleTasks(depName, "install", options, stateManager);
			if (!success) {
				console.error(`\nFailed to install dependency: ${depName}`);
				console.error("Aborting installation.");
				process.exit(1);
			}
			console.log("");
		}
	}

	// Handle warning for remove when dependents exist
	if (operation === "remove") {
		const allModulesResult = await loadAllModules();
		const resolver = new DependencyResolver(allModulesResult.modules);

		const dependents = resolver.getDependents(moduleName);
		if (dependents.length > 0) {
			console.warn(`Warning: The following modules depend on ${moduleName}:`);
			for (const dep of dependents) {
				console.warn(`  - ${dep}`);
			}
			console.warn("Proceeding with removal...\n");
		}
	}

	// Execute the main module operation
	const success = await executeModuleTasks(moduleName, operation, options, stateManager);
	if (!success) {
		process.exit(1);
	}
}

program
	.command("install")
	.description("Install a module")
	.argument("<module>", "Module name to install")
	.option("--dry-run", "Show what would be done without executing")
	.action(async (moduleName: string, options: ModuleOperationOptions) => {
		await executeModuleOperation(moduleName, "install", options);
	});

program
	.command("remove")
	.description("Remove a module")
	.argument("<module>", "Module name to remove")
	.option("--dry-run", "Show what would be done without executing")
	.action(async (moduleName: string, options: ModuleOperationOptions) => {
		await executeModuleOperation(moduleName, "remove", options);
	});

program
	.command("start")
	.description("Start module services")
	.argument("<module>", "Module name to start")
	.option("--dry-run", "Show what would be done without executing")
	.action(async (moduleName: string, options: ModuleOperationOptions) => {
		await executeModuleOperation(moduleName, "start", options);
	});

program
	.command("stop")
	.description("Stop module services")
	.argument("<module>", "Module name to stop")
	.option("--dry-run", "Show what would be done without executing")
	.action(async (moduleName: string, options: ModuleOperationOptions) => {
		await executeModuleOperation(moduleName, "stop", options);
	});

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
