import type { Command } from "commander";
import { getConfigManager } from "../core/config-manager.ts";
import { getModuleLoader } from "../core/module-loader.ts";
import { getStateManager } from "../core/state-manager.ts";
import { getDnsManager } from "../platform/index.ts";
import { getDashboardHostname, getTargetHostname } from "../types/config.ts";
import { KatanaError } from "../types/errors.ts";
import type { TargetModule } from "../types/module.ts";
import { logger } from "../utils/logger.ts";

/**
 * Register DNS management commands
 */
export function registerDnsCommands(program: Command): void {
  const dns = program.command("dns").description("DNS management commands");

  // katana dns sync
  dns
    .command("sync")
    .description("Synchronize /etc/hosts with installed targets (requires sudo)")
    .option("--all", "Sync all available targets, not just installed ones")
    .action(async (options: { all?: boolean }) => {
      try {
        const configManager = getConfigManager();
        const stateManager = getStateManager();
        const dnsManager = getDnsManager();

        const config = await configManager.get();
        const state = await stateManager.get();

        // Warn if remote install
        if (config.install_type === "remote") {
          logger.warn("Remote installs use wildcard DNS - /etc/hosts sync is not needed");
          logger.info("Configure wildcard DNS (e.g., *.domain → server IP) instead");
          return;
        }

        // Build list of hostnames
        const hostnames: string[] = [];

        // Add dashboard hostname
        const dashboardHost = getDashboardHostname(config);
        hostnames.push(dashboardHost);

        if (options.all) {
          // Add hostnames from ALL available targets
          const moduleLoader = await getModuleLoader();
          const targets = await moduleLoader.loadByCategory("targets");

          for (const target of targets) {
            const targetModule = target as TargetModule;
            for (const proxy of targetModule.proxy) {
              const hostname = getTargetHostname(config, proxy.hostname);
              hostnames.push(hostname);
            }
          }

          logger.info("Syncing DNS entries for all available targets...");
        } else {
          // Add hostnames from installed targets only
          for (const target of state.targets) {
            for (const route of target.routes) {
              hostnames.push(route.hostname);
            }
          }

          if (hostnames.length <= 1) {
            logger.info("No targets installed - only syncing dashboard hostname");
            logger.info("Use --all to sync all available targets");
          } else {
            logger.info("Syncing DNS entries for installed targets...");
          }
        }

        const result = await dnsManager.sync(hostnames);

        // Report results
        console.log("\nDNS Sync Complete");
        console.log("=================");

        if (result.added.length > 0) {
          console.log(`Added:     ${result.added.join(", ")}`);
        }
        if (result.removed.length > 0) {
          console.log(`Removed:   ${result.removed.join(", ")}`);
        }
        if (result.unchanged.length > 0) {
          console.log(`Unchanged: ${result.unchanged.length} entries`);
        }

        if (result.added.length === 0 && result.removed.length === 0) {
          logger.success("Already in sync - no changes needed");
        } else {
          logger.success("DNS entries updated");
        }
      } catch (error) {
        handleError(error);
      }
    });

  // katana dns list
  dns
    .command("list")
    .description("List DNS entries in /etc/hosts")
    .option("--all", "Show all entries (not just Katana-managed)")
    .action(async (options: { all?: boolean }) => {
      try {
        const dnsManager = getDnsManager();

        const entries = options.all ? await dnsManager.read() : await dnsManager.listManaged();

        console.log("DNS Entries (/etc/hosts)");
        console.log("========================\n");

        if (entries.length === 0) {
          if (options.all) {
            logger.info("No entries found");
          } else {
            logger.info("No Katana-managed entries found");
            logger.info("Run: sudo katana dns sync");
          }
          return;
        }

        for (const entry of entries) {
          const managedIcon = entry.managed ? "\u2713 managed" : "";
          console.log(`${entry.ip.padEnd(16)} ${entry.hostname.padEnd(30)} ${managedIcon}`);
        }

        console.log(`\nHosts file: ${dnsManager.getPath()}`);
      } catch (error) {
        handleError(error);
      }
    });
}

/**
 * Handle errors consistently
 */
function handleError(error: unknown): void {
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
