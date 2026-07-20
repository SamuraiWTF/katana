import { getComposeManager } from "../core/compose-manager.ts";
import { getDockerClient } from "../core/docker-client.ts";
import { getModuleLoader } from "../core/module-loader.ts";
import { getStateManager } from "../core/state-manager.ts";
import { NotFoundError } from "../types/errors.ts";
import { isTargetModule } from "../types/module.ts";

/**
 * View logs for a target
 */
export async function logsCommand(
  name: string,
  options: { follow?: boolean; tail?: number },
): Promise<void> {
  const stateManager = getStateManager();
  const moduleLoader = await getModuleLoader();

  // Check Docker connectivity first
  const docker = getDockerClient();
  await docker.checkPermissions();

  // Check if installed
  const target = await stateManager.findTarget(name);
  if (!target) {
    throw new NotFoundError("Installed target", name);
  }

  // Load module to get path
  const module = await moduleLoader.findModule(name);
  if (!module || !isTargetModule(module)) {
    throw new NotFoundError("Module", name);
  }

  if (!module.path) {
    throw new NotFoundError("Module path", name);
  }

  // Stream logs
  const composeManager = await getComposeManager();
  await composeManager.logs(name, module.path, options);
}
