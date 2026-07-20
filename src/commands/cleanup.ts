import type { Command } from "commander";
import { getConfigManager } from "../core/config-manager.ts";
import { getDockerClient } from "../core/docker-client.ts";
import { getStateManager } from "../core/state-manager.ts";
import { getDnsManager } from "../platform/linux/dns-manager.ts";
import { KatanaError } from "../types/errors.ts";
import { logger } from "../utils/logger.ts";

interface CleanupResult {
  orphanedContainers: string[];
  dnsFixed: boolean;
  dnsMessage: string;
  pruneResult?: string;
}

/**
 * Run cleanup operations
 */
async function runCleanup(options: {
  prune?: boolean;
  dryRun?: boolean;
}): Promise<CleanupResult> {
  const dockerClient = getDockerClient();
  const stateManager = getStateManager();
  const configManager = getConfigManager();
  const dnsManager = getDnsManager();

  const result: CleanupResult = {
    orphanedContainers: [],
    dnsFixed: false,
    dnsMessage: "",
  };

  // 1. Find and remove orphaned containers
  const state = await stateManager.get();
  const knownProjects = new Set(state.targets.map((t) => `katana-${t.name}`));

  const katanaContainers = await dockerClient.listKatanaContainers();

  for (const container of katanaContainers) {
    const project = container.labels["com.docker.compose.project"];
    if (project && !knownProjects.has(project)) {
      // This is an orphaned container
      if (!options.dryRun) {
        try {
          await dockerClient.removeContainer(container.name, { force: true, volumes: true });
          result.orphanedContainers.push(container.name);
        } catch (error) {
          logger.warn(`Failed to remove ${container.name}: ${error}`);
        }
      } else {
        result.orphanedContainers.push(container.name);
      }
    }
  }

  // 2. Check DNS entries
  const config = await configManager.get();

  // Build expected hostnames
  const expectedHostnames: string[] = [];

  // Add dashboard hostname
  const domain = config.install_type === "remote" ? config.base_domain : config.local_domain;
  expectedHostnames.push(`${config.dashboard_hostname}.${domain}`);

  // Add target hostnames
  for (const target of state.targets) {
    for (const route of target.routes) {
      expectedHostnames.push(route.hostname);
    }
  }

  // Check current managed entries
  const managedEntries = await dnsManager.listManaged();
  const currentHostnames = new Set(managedEntries.map((e) => e.hostname));
  const expectedSet = new Set(expectedHostnames);

  const missing = expectedHostnames.filter((h) => !currentHostnames.has(h));
  const extra = [...currentHostnames].filter((h) => !expectedSet.has(h));
  const needsSync = missing.length > 0 || extra.length > 0;

  if (needsSync) {
    // Check if running as root
    const isRoot = process.getuid?.() === 0;

    if (isRoot && !options.dryRun) {
      const syncResult = await dnsManager.sync(expectedHostnames);
      result.dnsFixed = true;
      const changes = syncResult.added.length + syncResult.removed.length;
      result.dnsMessage = `Fixed ${changes} DNS entries`;
    } else if (isRoot && options.dryRun) {
      result.dnsMessage = `Would fix ${missing.length + extra.length} DNS entries`;
    } else {
      result.dnsMessage = `DNS out of sync (${missing.length} missing, ${extra.length} extra) - run: sudo katana dns sync`;
    }
  } else {
    result.dnsMessage = "DNS entries in sync";
    result.dnsFixed = true;
  }

  // 3. Prune Docker images (optional)
  if (options.prune) {
    if (!options.dryRun) {
      try {
        const spaceReclaimed = await dockerClient.pruneImages();
        result.pruneResult = `Reclaimed ${spaceReclaimed}`;
      } catch (error) {
        result.pruneResult = `Prune failed: ${error}`;
      }
    } else {
      result.pruneResult = "Would prune unused images";
    }
  }

  return result;
}

/**
 * Register the cleanup command
 */
export function registerCleanupCommand(program: Command): void {
  program
    .command("cleanup")
    .description("Remove orphaned resources and fix inconsistencies")
    .option("--prune", "Also prune unused Docker images")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (options: { prune?: boolean; dryRun?: boolean }) => {
      try {
        console.log("Katana Cleanup");
        console.log("==============\n");

        if (options.dryRun) {
          console.log("[DRY RUN - no changes will be made]\n");
        }

        const result = await runCleanup(options);

        // Orphaned containers
        console.log("Orphaned Containers:");
        if (result.orphanedContainers.length === 0) {
          console.log("  None found");
        } else {
          const action = options.dryRun ? "Would remove" : "Removed";
          for (const name of result.orphanedContainers) {
            console.log(`  → ${action}: ${name}`);
          }
        }

        // DNS
        console.log("\nDNS Entries:");
        if (result.dnsFixed) {
          logger.success(`  ${result.dnsMessage}`);
        } else {
          logger.warn(`  ${result.dnsMessage}`);
        }

        // Prune
        console.log("\nDocker Prune:");
        if (result.pruneResult) {
          console.log(`  → ${result.pruneResult}`);
        } else {
          console.log("  → Skipped (use --prune to enable)");
        }

        console.log("\nCleanup complete.");
      } catch (error) {
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
    });
}
