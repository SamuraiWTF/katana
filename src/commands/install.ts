import { getComposeManager } from "../core/compose-manager.ts";
import { getConfigManager } from "../core/config-manager.ts";
import { getDockerClient } from "../core/docker-client.ts";
import { getModuleLoader } from "../core/module-loader.ts";
import { getStateManager } from "../core/state-manager.ts";
import { getToolExecutor } from "../core/tool-executor.ts";
import { type Config, getTargetHostname } from "../types/config.ts";
import { AlreadyExistsError, NotFoundError, SystemLockedError } from "../types/errors.ts";
import {
  type TargetModule,
  type ToolModule,
  isTargetModule,
  isToolModule,
} from "../types/module.ts";
import type { ProxyRoute, TargetState, ToolState } from "../types/state.ts";
import { logger } from "../utils/logger.ts";

/**
 * Build environment variables with full hostnames from configured domain
 * Transforms variables ending in _HOST to use getTargetHostname()
 */
function buildEnvWithDomain(
  moduleEnv: Record<string, string> | undefined,
  config: Config,
): Record<string, string> {
  if (!moduleEnv) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(moduleEnv)) {
    // Transform hostname variables to use configured domain
    if (key.endsWith("_HOST")) {
      result[key] = getTargetHostname(config, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Install a target or tool
 */
export async function installCommand(name: string, options: { skipDns?: boolean }): Promise<void> {
  const stateManager = getStateManager();
  const moduleLoader = await getModuleLoader();
  const configManager = getConfigManager();

  // Check Docker connectivity first
  const docker = getDockerClient();
  await docker.checkPermissions();

  // Check if system is locked
  if (await stateManager.isLocked()) {
    throw new SystemLockedError();
  }

  // Load module
  const module = await moduleLoader.findModule(name);
  if (!module) {
    throw new NotFoundError("Module", name);
  }

  // Check if already installed
  const existingTarget = await stateManager.findTarget(name);
  const existingTool = await stateManager.findTool(name);
  if (existingTarget || existingTool) {
    throw new AlreadyExistsError(existingTarget ? "Target" : "Tool", name);
  }

  // Handle based on category
  if (isTargetModule(module)) {
    await installTarget(module, stateManager, configManager);
  } else if (isToolModule(module)) {
    await installTool(module, stateManager);
  } else {
    logger.error("Unknown module category");
    process.exit(1);
  }

  // Print DNS reminder for targets only (unless skipped)
  if (!options.skipDns && isTargetModule(module)) {
    logger.info("");
    logger.warn("Run 'sudo katana dns sync' to update DNS entries");
  }
}

/**
 * Install a target module
 */
async function installTarget(
  module: TargetModule,
  stateManager: ReturnType<typeof getStateManager>,
  configManager: ReturnType<typeof getConfigManager>,
): Promise<void> {
  const composeManager = await getComposeManager();
  const config = await configManager.get();

  logger.info(`Installing target: ${module.name}`);

  // Build environment variables with configured domain
  const env = buildEnvWithDomain(module.env, config);

  // Run docker compose up with transformed environment
  await composeManager.up(module, env);

  // Build routes for state
  const routes: ProxyRoute[] = module.proxy.map((p) => ({
    hostname: getTargetHostname(config, p.hostname),
    service: p.service,
    port: p.port,
  }));

  // Add to state
  const targetState: TargetState = {
    name: module.name,
    installed_at: new Date().toISOString(),
    compose_project: composeManager.getProjectName(module.name),
    routes,
  };

  await stateManager.addTarget(targetState);

  logger.success(`Target ${module.name} installed successfully`);
  const primaryRoute = routes[0];
  if (primaryRoute) {
    logger.info(`Access at: https://${primaryRoute.hostname}/`);
  }
}

/**
 * Install a tool module
 */
async function installTool(
  module: ToolModule,
  stateManager: ReturnType<typeof getStateManager>,
): Promise<void> {
  const toolExecutor = getToolExecutor();

  logger.info(`Installing tool: ${module.name}`);

  // Execute install script
  const result = await toolExecutor.executeInstall(module);

  // Add to state
  const toolState: ToolState = {
    name: module.name,
    installed_at: new Date().toISOString(),
    version: result.version,
  };

  await stateManager.addTool(toolState);

  logger.success(`Tool ${module.name} installed successfully`);
  if (result.version) {
    logger.info(`Version: ${result.version}`);
  }
}
