/**
 * API routes for module management
 */

import { getComposeManager } from "../../core/compose-manager.ts";
import { getConfigManager } from "../../core/config-manager.ts";
import { getModuleLoader } from "../../core/module-loader.ts";
import { getOperationManager } from "../../core/operation-manager.ts";
import { getStateManager } from "../../core/state-manager.ts";
import { getTargetHostname } from "../../types/config.ts";

// =============================================================================
// Types
// =============================================================================

export type ModuleStatus = "not_installed" | "installed" | "running" | "stopped" | "unknown";

export interface ModuleInfo {
  name: string;
  category: "targets" | "tools";
  description: string;
  status: ModuleStatus;
  hrefs: string[];
}

interface ModulesResponse {
  success: true;
  data: {
    modules: ModuleInfo[];
    locked: boolean;
    lockMessage?: string;
  };
}

interface OperationResponse {
  success: true;
  data: {
    operationId: string;
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * GET /api/modules
 * List all available modules with their status
 */
export async function handleGetModules(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const categoryFilter = url.searchParams.get("category") as "targets" | "tools" | null;

    const moduleLoader = await getModuleLoader();
    const stateManager = getStateManager();
    const composeManager = await getComposeManager();
    const configManager = getConfigManager();
    const config = await configManager.get();

    // Load all modules
    let modules = await moduleLoader.loadAll();

    // Filter by category if requested
    if (categoryFilter) {
      modules = modules.filter((m) => m.category === categoryFilter);
    }

    // Get installed targets from state
    const state = await stateManager.get();
    const installedTargets = new Set(state.targets.map((t) => t.name.toLowerCase()));
    const installedTools = new Set(state.tools.map((t) => t.name.toLowerCase()));

    // Build module info with status
    const moduleInfos: ModuleInfo[] = [];

    for (const mod of modules) {
      const isInstalled =
        mod.category === "targets"
          ? installedTargets.has(mod.name.toLowerCase())
          : installedTools.has(mod.name.toLowerCase());

      let status: ModuleStatus = "not_installed";
      const hrefs: string[] = [];

      if (mod.category === "targets" && isInstalled) {
        // Check compose status for running state
        const composeStatus = await composeManager.status(mod.name);

        if (composeStatus.containers.length === 0) {
          status = "installed";
        } else if (composeStatus.all_running) {
          status = "running";

          // Build URLs from proxy config
          for (const p of mod.proxy) {
            const hostname = getTargetHostname(config, p.hostname);
            hrefs.push(`https://${hostname}/`);
          }
        } else if (composeStatus.any_running) {
          status = "running"; // Partially running is still running
        } else {
          status = "stopped";
        }
      } else if (mod.category === "tools" && isInstalled) {
        status = "installed";
      }

      moduleInfos.push({
        name: mod.name,
        category: mod.category,
        description: mod.description,
        status,
        hrefs,
      });
    }

    const response: ModulesResponse = {
      success: true,
      data: {
        modules: moduleInfos,
        locked: state.locked,
        lockMessage: state.locked ? "System is locked. Unlock to make changes." : undefined,
      },
    };

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = { success: false, error: message };
    return Response.json(response, { status: 500 });
  }
}

/**
 * POST /api/modules/:name/:operation
 * Start an operation (install, remove, start, stop)
 */
export async function handleModuleOperation(
  req: Request,
  name: string,
  operation: string,
): Promise<Response> {
  try {
    // Validate operation
    const validOperations = ["install", "remove", "start", "stop"];
    if (!validOperations.includes(operation)) {
      const response: ErrorResponse = {
        success: false,
        error: `Invalid operation: ${operation}. Must be one of: ${validOperations.join(", ")}`,
      };
      return Response.json(response, { status: 400 });
    }

    const stateManager = getStateManager();
    const moduleLoader = await getModuleLoader();
    const operationManager = getOperationManager();

    // Check system lock for install/remove
    if (operation === "install" || operation === "remove") {
      const locked = await stateManager.isLocked();
      if (locked) {
        const response: ErrorResponse = {
          success: false,
          error: "System is locked. Run 'katana unlock' to allow changes.",
        };
        return Response.json(response, { status: 423 }); // 423 Locked
      }
    }

    // Verify module exists
    const module = await moduleLoader.findModule(name);
    if (!module) {
      const response: ErrorResponse = {
        success: false,
        error: `Module not found: ${name}`,
      };
      return Response.json(response, { status: 404 });
    }

    // Check if operation already in progress
    if (operationManager.hasOperationInProgress(name)) {
      const response: ErrorResponse = {
        success: false,
        error: `Operation already in progress for module: ${name}`,
      };
      return Response.json(response, { status: 409 }); // 409 Conflict
    }

    // Validate operation is appropriate for current state
    const state = await stateManager.get();
    const installedTarget = state.targets.find((t) => t.name.toLowerCase() === name.toLowerCase());

    if (operation === "install" && installedTarget) {
      const response: ErrorResponse = {
        success: false,
        error: `Module already installed: ${name}`,
      };
      return Response.json(response, { status: 409 });
    }

    if (
      (operation === "remove" || operation === "start" || operation === "stop") &&
      !installedTarget
    ) {
      const response: ErrorResponse = {
        success: false,
        error: `Module not installed: ${name}`,
      };
      return Response.json(response, { status: 400 });
    }

    // Create and start the operation
    const tracked = await operationManager.createOperation(
      name,
      operation as "install" | "remove" | "start" | "stop",
    );

    const response: OperationResponse = {
      success: true,
      data: {
        operationId: tracked.id,
      },
    };

    return Response.json(response, { status: 202 }); // 202 Accepted
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = { success: false, error: message };
    return Response.json(response, { status: 500 });
  }
}
