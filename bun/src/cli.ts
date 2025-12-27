#!/usr/bin/env bun
import { resolve } from "node:path";
import { Command } from "commander";
import {
	formatModuleLoadError,
	formatModuleLoaderErrors,
	loadAllModules,
	loadModule,
	validateModuleFile,
} from "./core/module-loader";
import { StateManager } from "./core/state-manager";
import type { ModuleCategory } from "./types";

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
			const options = category ? { category: category as ModuleCategory } : {};
			const result = await loadAllModules(options);

			if (!result.success && result.modules.length === 0) {
				console.error(formatModuleLoaderErrors(result));
				process.exit(1);
			}

			if (result.modules.length === 0) {
				console.log(category ? `No modules found in category: ${category}` : "No modules found");
				return;
			}

			// Print header
			console.log("");
			console.log(`${"NAME".padEnd(25)} ${"CATEGORY".padEnd(12)} DESCRIPTION`);
			console.log(`${"-".repeat(25)} ${"-".repeat(12)} ${"-".repeat(40)}`);

			// Sort and print modules
			const sorted = result.modules.sort((a, b) => a.name.localeCompare(b.name));
			for (const mod of sorted) {
				const desc = mod.description?.slice(0, 50) || "";
				console.log(`${mod.name.padEnd(25)} ${mod.category.padEnd(12)} ${desc}`);
			}

			console.log("");
			console.log(`Total: ${result.modules.length} module(s)`);

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

program.command("init").description("Initialize katana configuration").action(stubAction("init"));

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
