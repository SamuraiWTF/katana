#!/usr/bin/env bun
import { Command } from "commander";
import { registerCertCommands } from "./commands/cert.ts";
import { registerCleanupCommand } from "./commands/cleanup.ts";
import { registerDnsCommands } from "./commands/dns.ts";
import { registerDoctorCommand } from "./commands/doctor.ts";
import { installCommand } from "./commands/install.ts";
import { logsCommand } from "./commands/logs.ts";
import { registerProxyCommands } from "./commands/proxy.ts";
import { removeCommand } from "./commands/remove.ts";
import { registerSetupCommands } from "./commands/setup.ts";
import { startCommand } from "./commands/start.ts";
import { stopCommand } from "./commands/stop.ts";
import { getComposeManager } from "./core/compose-manager.ts";
import { getConfigManager, initConfigManager } from "./core/config-manager.ts";
import { getModuleLoader } from "./core/module-loader.ts";
import { getStateManager } from "./core/state-manager.ts";
import { KatanaError } from "./types/errors.ts";
import { logger } from "./utils/logger.ts";

const program = new Command();

program
  .name("katana")
  .description("OWASP SamuraiWTF lab management solution")
  .version("2.0.0")
  .option("-c, --config <path>", "Path to config file")
  .hook("preAction", (thisCommand) => {
    // Initialize ConfigManager with custom path if provided
    const opts = thisCommand.opts();
    if (opts.config) {
      initConfigManager(opts.config);
    }
  });

// Status command - shows system status
program
  .command("status")
  .description("Show system status")
  .action(async () => {
    try {
      const configManager = getConfigManager();
      const stateManager = getStateManager();

      const config = await configManager.get();
      const state = await stateManager.get();

      console.log("Katana System Status");
      console.log("====================\n");

      console.log(`Locked: ${state.locked ? "Yes" : "No"}`);
      console.log(`Install Type: ${config.install_type}`);
      const domain = config.install_type === "remote" ? config.base_domain : config.local_domain;
      console.log(`Domain: ${domain}`);

      // Count running targets
      let runningCount = 0;
      if (state.targets.length > 0) {
        const composeManager = await getComposeManager();
        for (const target of state.targets) {
          const status = await composeManager.status(target.name);
          if (status.all_running) runningCount++;
        }
      }

      console.log(`Targets: ${state.targets.length} installed, ${runningCount} running`);
      console.log(`Tools: ${state.tools.length} installed`);

      if (state.targets.length > 0) {
        console.log("\nInstalled Targets:");
        const composeManager = await getComposeManager();
        for (const target of state.targets) {
          const status = await composeManager.status(target.name);
          const statusIcon = status.all_running ? "\u2713" : "\u2717";
          const statusText = status.all_running ? "running" : "stopped";
          console.log(`  ${statusIcon} ${target.name.padEnd(15)} (${statusText})`);
        }
      }

      if (state.tools.length > 0) {
        console.log("\nInstalled Tools:");
        for (const tool of state.tools) {
          console.log(`  - ${tool.name}${tool.version ? ` v${tool.version}` : ""}`);
        }
      }

      console.log(`\nConfig: ${configManager.getPath()}`);
      console.log(`State: ${stateManager.getPath()}`);
    } catch (error) {
      handleError(error);
    }
  });

// Lock command
program
  .command("lock")
  .description("Lock the system to prevent modifications")
  .action(async () => {
    try {
      const stateManager = getStateManager();
      await stateManager.setLocked(true);
      logger.success("System locked");
    } catch (error) {
      handleError(error);
    }
  });

// Unlock command
program
  .command("unlock")
  .description("Unlock the system to allow modifications")
  .action(async () => {
    try {
      const stateManager = getStateManager();
      await stateManager.setLocked(false);
      logger.success("System unlocked");
    } catch (error) {
      handleError(error);
    }
  });

// List command - shows available modules
program
  .command("list")
  .description("List available modules")
  .argument("[category]", "Filter by category: targets or tools")
  .option("--installed", "Show only installed modules")
  .action(async (category: string | undefined, options: { installed?: boolean }) => {
    try {
      const moduleLoader = await getModuleLoader();
      const stateManager = getStateManager();
      const state = await stateManager.get();

      // Get installed module names for marking
      const installedTargets = new Set(state.targets.map((t) => t.name));
      const installedTools = new Set(state.tools.map((t) => t.name));

      // Determine which categories to show
      const showTargets = !category || category === "targets";
      const showTools = !category || category === "tools";

      // Validate category argument
      if (category && category !== "targets" && category !== "tools") {
        logger.error(`Invalid category: ${category}. Use 'targets' or 'tools'.`);
        process.exit(1);
      }

      // Load and display targets
      if (showTargets) {
        const targets = await moduleLoader.loadByCategory("targets");
        const filteredTargets = options.installed
          ? targets.filter((m) => installedTargets.has(m.name))
          : targets;

        console.log("Available Targets:");
        if (filteredTargets.length === 0) {
          console.log("  (none)");
        } else {
          for (const target of filteredTargets) {
            const installed = installedTargets.has(target.name) ? " [installed]" : "";
            console.log(`  ${target.name.padEnd(15)} - ${target.description}${installed}`);
          }
        }
      }

      // Load and display tools
      if (showTools) {
        if (showTargets) console.log(); // Add spacing between sections

        const tools = await moduleLoader.loadByCategory("tools");
        const filteredTools = options.installed
          ? tools.filter((m) => installedTools.has(m.name))
          : tools;

        console.log("Available Tools:");
        if (filteredTools.length === 0) {
          console.log("  (none)");
        } else {
          for (const tool of filteredTools) {
            const installed = installedTools.has(tool.name) ? " [installed]" : "";
            console.log(`  ${tool.name.padEnd(15)} - ${tool.description}${installed}`);
          }
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

// Install command
program
  .command("install <name>")
  .description("Install a target or tool")
  .option("--skip-dns", "Skip DNS update reminder")
  .action(async (name: string, options: { skipDns?: boolean }) => {
    try {
      await installCommand(name, options);
    } catch (error) {
      handleError(error);
    }
  });

// Remove command
program
  .command("remove <name>")
  .description("Remove an installed target or tool")
  .action(async (name: string) => {
    try {
      await removeCommand(name);
    } catch (error) {
      handleError(error);
    }
  });

// Start command
program
  .command("start <name>")
  .description("Start a stopped target")
  .action(async (name: string) => {
    try {
      await startCommand(name);
    } catch (error) {
      handleError(error);
    }
  });

// Stop command
program
  .command("stop <name>")
  .description("Stop a running target")
  .action(async (name: string) => {
    try {
      await stopCommand(name);
    } catch (error) {
      handleError(error);
    }
  });

// Logs command
program
  .command("logs <name>")
  .description("View logs for a target")
  .option("-f, --follow", "Follow log output")
  .option("-t, --tail <lines>", "Number of lines to show", "100")
  .action(async (name: string, options: { follow?: boolean; tail?: string }) => {
    try {
      await logsCommand(name, {
        follow: options.follow,
        tail: options.tail ? Number.parseInt(options.tail, 10) : 100,
      });
    } catch (error) {
      handleError(error);
    }
  });

// Certificate commands
registerCertCommands(program);

// DNS commands
registerDnsCommands(program);

// Proxy commands
registerProxyCommands(program);

// Setup commands
registerSetupCommands(program);

// Doctor command
registerDoctorCommand(program);

// Cleanup command
registerCleanupCommand(program);

/**
 * Handle errors consistently
 */
export function handleError(error: unknown): void {
  if (error instanceof KatanaError) {
    logger.error(error.message);
    if (error.help) {
      console.log(`Help: ${error.help()}`);
    }
    process.exit(1);
  }

  if (error instanceof Error) {
    logger.error(error.message);
    process.exit(1);
  }

  logger.error("An unknown error occurred");
  process.exit(1);
}

// Parse and execute
program.parse();
