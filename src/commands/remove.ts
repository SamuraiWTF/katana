import { getComposeManager } from "../core/compose-manager.ts";
import { getDockerClient } from "../core/docker-client.ts";
import { getModuleLoader } from "../core/module-loader.ts";
import { getStateManager } from "../core/state-manager.ts";
import { getToolExecutor } from "../core/tool-executor.ts";
import { NotFoundError, SystemLockedError } from "../types/errors.ts";
import { isTargetModule, isToolModule } from "../types/module.ts";
import { logger } from "../utils/logger.ts";

/**
 * Remove an installed target or tool
 */
export async function removeCommand(name: string): Promise<void> {
  const stateManager = getStateManager();
  const moduleLoader = await getModuleLoader();

  // Check Docker connectivity first
  const docker = getDockerClient();
  await docker.checkPermissions();

  // Check if system is locked
  if (await stateManager.isLocked()) {
    throw new SystemLockedError();
  }

  // Check if installed (check both targets and tools)
  const target = await stateManager.findTarget(name);
  const tool = await stateManager.findTool(name);

  if (!target && !tool) {
    throw new NotFoundError("Installed module", name);
  }

  // Load module to get path
  const module = await moduleLoader.findModule(name);
  if (!module) {
    throw new NotFoundError("Module", name);
  }

  if (!module.path) {
    throw new NotFoundError("Module path", name);
  }

  // Handle based on category
  if (isTargetModule(module)) {
    logger.info(`Removing target: ${name}`);

    // Run docker compose down
    const composeManager = await getComposeManager();
    await composeManager.down(name, module.path);

    // Remove from state
    await stateManager.removeTarget(name);

    logger.success(`Target ${name} removed successfully`);
  } else if (isToolModule(module)) {
    logger.info(`Removing tool: ${name}`);

    // Execute remove script
    const toolExecutor = getToolExecutor();
    await toolExecutor.executeRemove(module);

    // Remove from state
    await stateManager.removeTool(name);

    logger.success(`Tool ${name} removed successfully`);
  } else {
    logger.error("Unknown module category");
    process.exit(1);
  }
}
