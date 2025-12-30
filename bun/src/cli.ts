#!/usr/bin/env bun
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { stringify as yamlStringify } from "yaml";
import { CertManager } from "./core/cert-manager";
import { DependencyResolver } from "./core/dependencies";
import { allSucceeded, getChanges, getFailures, TaskExecutor } from "./core/executor";
import { ConfigManager } from "./core/config-manager";
import { ModuleFetcher } from "./core/module-fetcher";
import {
	formatModuleLoadError,
	formatModuleLoaderErrors,
	loadAllModules,
	loadModule,
	ModuleLoader,
	ModulesNotFoundError,
	validateModuleFile,
} from "./core/module-loader";
import { StateManager } from "./core/state-manager";
import { StatusChecker } from "./core/status";
import { getPluginRegistry } from "./plugins/registry";
import { createServer, printServerInfo } from "./server";
import type { ModuleCategory, Operation, Task } from "./types";
import { ConfigSchema, DEFAULT_CONFIG } from "./types/config";

const program = new Command();

program.name("katana").version("0.1.0").description("Module deployment and management CLI");

// =============================================================================
// Error Handling Helpers
// =============================================================================

/**
 * Handle ModulesNotFoundError with helpful guidance
 */
function handleModulesNotFoundError(error: unknown): boolean {
	if (error instanceof ModulesNotFoundError) {
		console.error("");
		console.error("Modules not found.");
		console.error("");
		console.error("To fix this, you can:");
		console.error("  1. Run 'katana update' to fetch modules from GitHub");
		console.error("  2. Run 'katana init' to set up configuration");
		console.error("  3. Set KATANA_HOME environment variable to your katana directory");
		console.error("");
		return true;
	}
	return false;
}

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
			if (handleModulesNotFoundError(error)) {
				process.exit(1);
			}
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
			if (handleModulesNotFoundError(error)) {
				process.exit(1);
			}
			console.error("Error checking status:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

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
	modulesBranch?: string;
	fetchModules?: boolean;
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
	.option("--modules-branch <branch>", "Git branch for module updates (default: main)")
	.option("--fetch-modules", "Fetch modules from GitHub after creating config")
	.option("--force", "Overwrite existing config file without prompting")
	.action(async (options: InitOptions) => {
		// Import ModuleFetcher here to avoid circular dependency issues
		const { ModuleFetcher } = await import("./core/module-fetcher");

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
			let modulesPath = options.modulesPath; // Now optional, undefined means auto-resolve
			let modulesBranch = options.modulesBranch ?? DEFAULT_CONFIG.modulesBranch;
			let fetchModules = options.fetchModules ?? false;
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

						modulesBranch = await promptWithDefault(
							rl,
							"Git branch for module updates",
							options.modulesBranch ?? DEFAULT_CONFIG.modulesBranch,
						);

						// Only prompt for modulesPath if user wants custom location
						const customModulesPath = await promptConfirm(
							rl,
							"Use custom modules path? (No = auto-detect)",
							false,
						);
						if (customModulesPath) {
							modulesPath = await promptWithDefault(
								rl,
								"Path to modules directory",
								options.modulesPath ?? "~/.local/share/katana/modules",
							);
						}

						// Ask about fetching modules
						if (!options.fetchModules) {
							fetchModules = await promptConfirm(rl, "Fetch modules from GitHub now?", true);
						}

						console.log("");
					}
				} finally {
					rl.close();
				}
			}

			if (!shouldWrite) {
				return;
			}

			// Build config object - only include modulesPath if explicitly set
			const config: Record<string, unknown> = {
				statePath: DEFAULT_CONFIG.statePath,
				domainBase,
				modulesRepo: DEFAULT_CONFIG.modulesRepo,
				modulesBranch,
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

			// Only add modulesPath if explicitly configured
			if (modulesPath) {
				config.modulesPath = modulesPath;
			}

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
			console.log(`  Modules branch: ${modulesBranch}`);
			if (modulesPath) {
				console.log(`  Modules path: ${modulesPath}`);
			} else {
				console.log(`  Modules path: (auto-detect)`);
			}

			// Fetch modules if requested
			if (fetchModules) {
				console.log("");
				console.log("Fetching modules...");

				const fetcher = new ModuleFetcher();
				const fetchResult = await fetcher.fetchModules({
					repo: DEFAULT_CONFIG.modulesRepo,
					branch: modulesBranch,
				});

				if (fetchResult.success) {
					console.log(fetchResult.isUpdate ? "Modules updated." : "Modules cloned.");
					console.log(`  Location: ${fetchResult.modulesPath}`);
				} else {
					console.error(`Failed to fetch modules: ${fetchResult.message}`);
					console.error("You can try again later with: katana update");
				}
			}
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
	let result: Awaited<ReturnType<typeof loadModule>>;
	try {
		result = await loadModule(moduleName);
	} catch (error) {
		if (handleModulesNotFoundError(error)) {
			process.exit(1);
		}
		throw error;
	}

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

// =============================================================================
// Update Command
// =============================================================================

interface UpdateOptions {
	branch?: string;
	force?: boolean;
}

program
	.command("update")
	.description("Fetch or update modules from GitHub")
	.option("-b, --branch <branch>", "Git branch to use (overrides config)")
	.option("--force", "Force re-clone even if modules exist")
	.action(async (options: UpdateOptions) => {
		try {
			// Load config for repo and branch defaults
			const configManager = ConfigManager.getInstance();
			const config = await configManager.loadConfig();

			const repo = config.modulesRepo;
			const branch = options.branch ?? config.modulesBranch;

			console.log("");
			console.log("Updating modules...");
			console.log(`  Repository: ${repo}`);
			console.log(`  Branch: ${branch}`);
			console.log("");

			const fetcher = new ModuleFetcher();
			const result = await fetcher.fetchModules({ repo, branch });

			if (result.success) {
				console.log(
					result.isUpdate ? "Modules updated successfully." : "Modules cloned successfully.",
				);
				console.log(`  Location: ${result.modulesPath}`);
				console.log("");

				// Reset the ModuleLoader singleton to pick up new path
				ModuleLoader.resetInstance();

				// Verify modules are accessible
				const loader = ModuleLoader.getInstance(config);
				if (loader.hasModules()) {
					const modules = await loader.getModuleNames();
					console.log(`Found ${modules.length} modules.`);
				}
			} else {
				console.error("Failed to update modules:");
				console.error(`  ${result.message}`);
				process.exit(1);
			}
		} catch (error) {
			console.error("Error updating modules:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

// =============================================================================
// Cert Command
// =============================================================================

const certCmd = program.command("cert").description("Certificate management");

certCmd
	.command("init")
	.description("Generate root CA and wildcard certificate")
	.option("--force", "Regenerate certificates even if they exist")
	.action(async (options: { force?: boolean }) => {
		try {
			// Load config to get domainBase and statePath
			const configManager = ConfigManager.getInstance();
			const config = await configManager.loadConfig();

			console.log("");
			console.log("Certificate Initialization");
			console.log("==========================");
			console.log("");
			console.log(`Domain: *.${config.domainBase}`);
			console.log(`State path: ${config.statePath}`);
			console.log("");

			// Initialize cert manager with config
			const certManager = CertManager.getInstance();
			certManager.setStatePath(config.statePath);

			const result = await certManager.initCerts(config.domainBase, options.force);

			if (result.success) {
				console.log(result.message);
				if (result.certPaths) {
					console.log("");
					console.log("Certificate files:");
					console.log(`  Root CA:   ${result.certPaths.rootCACert}`);
					console.log(`  Wildcard:  ${result.certPaths.cert}`);
					console.log("");
					console.log("Next steps:");
					console.log("  1. Run 'sudo katana cert install-ca' to trust the root CA system-wide");
					console.log("  2. Or import the root CA into your browser manually");
				}
			} else {
				console.error(`Error: ${result.message}`);
				process.exit(1);
			}
		} catch (error) {
			console.error("Error initializing certificates:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

certCmd
	.command("install-ca")
	.description("Install root CA to system trust store (requires sudo)")
	.action(async () => {
		try {
			// Load config to get statePath
			const configManager = ConfigManager.getInstance();
			const config = await configManager.loadConfig();

			// Initialize cert manager with config
			const certManager = CertManager.getInstance();
			certManager.setStatePath(config.statePath);

			console.log("");
			console.log("Installing Root CA to system trust store...");
			console.log("");

			const result = await certManager.installCA();

			if (result.success) {
				console.log(result.message);
				console.log("");
				console.log("The Katana root CA is now trusted system-wide.");
				console.log("Browsers may need to be restarted to pick up the change.");
			} else {
				console.error(`Error: ${result.message}`);
				process.exit(1);
			}
		} catch (error) {
			console.error("Error installing CA:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

certCmd
	.command("status")
	.description("Show certificate status")
	.action(async () => {
		try {
			// Load config to get statePath
			const configManager = ConfigManager.getInstance();
			const config = await configManager.loadConfig();

			// Initialize cert manager with config
			const certManager = CertManager.getInstance();
			certManager.setStatePath(config.statePath);

			console.log("");
			console.log("Certificate Status");
			console.log("==================");
			console.log("");

			const hasCerts = await certManager.hasCerts();
			const state = await certManager.getCertState();

			if (hasCerts && state) {
				console.log(`Status: Initialized`);
				console.log(`Domain: *.${state.domainBase}`);
				console.log(`Created: ${state.createdAt}`);
				console.log("");

				const paths = certManager.getCertPaths();
				console.log("Certificate files:");
				console.log(`  Root CA cert: ${paths.rootCACert}`);
				console.log(`  Root CA key:  ${paths.rootCAKey}`);
				console.log(`  Wildcard cert: ${paths.cert}`);
				console.log(`  Wildcard key:  ${paths.key}`);
			} else {
				console.log(`Status: Not initialized`);
				console.log("");
				console.log("Run 'katana cert init' to generate certificates.");
			}
		} catch (error) {
			console.error("Error checking certificate status:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

// =============================================================================
// Service Command (systemd)
// =============================================================================

const SYSTEMD_SERVICE_PATH = "/etc/systemd/system/katana.service";

const SYSTEMD_SERVICE_CONTENT = `[Unit]
Description=Katana Module Management Server
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/katana serve --tls --host 0.0.0.0
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/katana /etc/nginx/sites-available /etc/nginx/sites-enabled

# Environment
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;

const serviceCmd = program.command("service").description("Manage katana systemd service");

serviceCmd
	.command("install")
	.description("Install and enable systemd service (requires sudo)")
	.option("--no-tls", "Run server without TLS")
	.option("--port <port>", "Override default port", Number.parseInt)
	.action(async (options: { tls?: boolean; port?: number }) => {
		try {
			// Check if running as root
			if (process.getuid?.() !== 0) {
				console.error("Error: This command requires root privileges.");
				console.error("Run with: sudo katana service install");
				process.exit(1);
			}

			// Build ExecStart line based on options
			let execStart = "/usr/local/bin/katana serve --host 0.0.0.0";
			if (options.tls !== false) {
				execStart += " --tls";
			}
			if (options.port) {
				execStart += ` --port ${options.port}`;
			}

			// Customize service content
			const serviceContent = SYSTEMD_SERVICE_CONTENT.replace(
				/ExecStart=.*/,
				`ExecStart=${execStart}`,
			);

			console.log("");
			console.log("Installing Katana systemd service...");
			console.log("");

			// Write service file
			await Bun.write(SYSTEMD_SERVICE_PATH, serviceContent);
			console.log(`Created ${SYSTEMD_SERVICE_PATH}`);

			// Reload systemd
			await Bun.$`systemctl daemon-reload`.quiet();
			console.log("Reloaded systemd configuration");

			// Enable service
			await Bun.$`systemctl enable katana.service`.quiet();
			console.log("Enabled katana.service");

			console.log("");
			console.log("Service installed successfully.");
			console.log("");
			console.log("Commands:");
			console.log("  sudo systemctl start katana    # Start the service");
			console.log("  sudo systemctl stop katana     # Stop the service");
			console.log("  sudo systemctl status katana   # Check status");
			console.log("  journalctl -u katana -f        # View logs");
		} catch (error) {
			console.error("Error installing service:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

serviceCmd
	.command("uninstall")
	.description("Stop and remove systemd service (requires sudo)")
	.action(async () => {
		try {
			// Check if running as root
			if (process.getuid?.() !== 0) {
				console.error("Error: This command requires root privileges.");
				console.error("Run with: sudo katana service uninstall");
				process.exit(1);
			}

			console.log("");
			console.log("Uninstalling Katana systemd service...");
			console.log("");

			// Stop service if running
			try {
				await Bun.$`systemctl stop katana.service`.quiet();
				console.log("Stopped katana.service");
			} catch {
				// Service might not be running
			}

			// Disable service
			try {
				await Bun.$`systemctl disable katana.service`.quiet();
				console.log("Disabled katana.service");
			} catch {
				// Service might not be enabled
			}

			// Remove service file
			const file = Bun.file(SYSTEMD_SERVICE_PATH);
			if (await file.exists()) {
				await Bun.$`rm ${SYSTEMD_SERVICE_PATH}`.quiet();
				console.log(`Removed ${SYSTEMD_SERVICE_PATH}`);
			}

			// Reload systemd
			await Bun.$`systemctl daemon-reload`.quiet();
			console.log("Reloaded systemd configuration");

			console.log("");
			console.log("Service uninstalled.");
		} catch (error) {
			console.error("Error uninstalling service:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

serviceCmd
	.command("status")
	.description("Show systemd service status")
	.action(async () => {
		try {
			const file = Bun.file(SYSTEMD_SERVICE_PATH);
			if (!(await file.exists())) {
				console.log("Katana service is not installed.");
				console.log("Run 'sudo katana service install' to install it.");
				return;
			}

			// Get service status
			const result = await Bun.$`systemctl status katana.service --no-pager`.nothrow();
			console.log(result.stdout.toString());
		} catch (error) {
			console.error("Error checking service status:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

// =============================================================================
// Serve Command
// =============================================================================

interface ServeOptions {
	port?: number;
	host?: string;
	cors?: boolean;
	tls?: boolean;
}

program
	.command("serve")
	.description("Start the REST API server")
	.option("-p, --port <port>", "Port to listen on", Number.parseInt)
	.option("--host <host>", "Host to bind to")
	.option("--cors", "Enable CORS for development")
	.option("--tls", "Enable TLS using Katana certificates")
	.action(async (options: ServeOptions) => {
		try {
			// Load config
			const configManager = ConfigManager.getInstance();
			const config = await configManager.loadConfig();

			// Override config with CLI options
			if (options.port) {
				config.server.port = options.port;
			}
			if (options.host) {
				config.server.host = options.host;
			}
			if (options.cors) {
				config.server.cors = true;
			}

			// Handle TLS option
			let tlsConfig: { cert: string; key: string } | undefined;
			if (options.tls) {
				const certManager = CertManager.getInstance();
				certManager.setStatePath(config.statePath);

				if (!(await certManager.hasCerts())) {
					console.error("Error: Certificates not initialized.");
					console.error("Run 'katana cert init' first to generate certificates.");
					process.exit(1);
				}

				const certPaths = certManager.getCertPaths();
				tlsConfig = {
					cert: certPaths.cert,
					key: certPaths.key,
				};
			}

			// Start server
			createServer({ config, tls: tlsConfig });
			printServerInfo(config, options.tls);
		} catch (error) {
			console.error("Error starting server:", error instanceof Error ? error.message : error);
			process.exit(1);
		}
	});

// =============================================================================
// Parse and run
// =============================================================================

program.parse();
