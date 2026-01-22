import { getDashboardHostname } from "../types/config.ts";
import type { TargetState } from "../types/state.ts";
import { getConfigManager } from "./config-manager.ts";
import { getStateManager } from "./state-manager.ts";

/**
 * Resolved route information for proxying
 */
export interface ResolvedRoute {
  /** Container name (e.g., "katana-dvwa-dvwa-1") */
  containerName: string;
  /** Port inside the container */
  port: number;
  /** Compose project name */
  composeProject: string;
  /** Service name from compose file */
  service: string;
  /** Target name for display */
  targetName: string;
}

/**
 * Route lookup result
 */
export type RouteResult =
  | { type: "dashboard" }
  | { type: "target"; route: ResolvedRoute }
  | { type: "not_found" };

/**
 * Routes incoming requests to appropriate targets based on hostname
 */
export class ProxyRouter {
  private routes: Map<string, ResolvedRoute> = new Map();
  private dashboardHostname = "";

  /**
   * Load routes from state file
   * Called on startup and when targets change
   */
  async loadRoutes(): Promise<void> {
    const stateManager = getStateManager();
    const configManager = getConfigManager();

    const state = await stateManager.get();
    const config = await configManager.get();

    // Build dashboard hostname
    this.dashboardHostname = getDashboardHostname(config).toLowerCase();

    // Clear existing routes
    this.routes.clear();

    // Build routes from installed targets
    for (const target of state.targets) {
      this.addTargetRoutes(target);
    }
  }

  /**
   * Add routes for a target
   */
  private addTargetRoutes(target: TargetState): void {
    for (const route of target.routes) {
      // Routes in state already have full hostname (e.g., "dvwa.test")
      const hostname = route.hostname.toLowerCase();

      // Container name follows Docker Compose V2 convention:
      // <project>-<service>-<instance>
      const containerName = `${target.compose_project}-${route.service}-1`;

      this.routes.set(hostname, {
        containerName,
        port: route.port,
        composeProject: target.compose_project,
        service: route.service,
        targetName: target.name,
      });
    }
  }

  /**
   * Resolve hostname to route
   */
  resolve(hostname: string): RouteResult {
    // Strip port if present (e.g., "dvwa.test:443" -> "dvwa.test")
    const hostPart = hostname.split(":")[0];
    const normalizedHost = (hostPart || hostname).toLowerCase();

    // Check for dashboard
    if (normalizedHost === this.dashboardHostname) {
      return { type: "dashboard" };
    }

    // Check for target route
    const route = this.routes.get(normalizedHost);
    if (route) {
      return { type: "target", route };
    }

    return { type: "not_found" };
  }

  /**
   * Get all registered routes (for status display)
   */
  getRoutes(): Map<string, ResolvedRoute> {
    return new Map(this.routes);
  }

  /**
   * Get dashboard hostname
   */
  getDashboardHostname(): string {
    return this.dashboardHostname;
  }

  /**
   * Reload routes from state
   */
  async reload(): Promise<void> {
    await this.loadRoutes();
  }
}

// Singleton instance
let routerInstance: ProxyRouter | null = null;

/**
 * Get the ProxyRouter instance (creates if needed, always reloads routes)
 * Routes are reloaded on each call to pick up target installs/removals
 */
export async function getProxyRouter(): Promise<ProxyRouter> {
  if (!routerInstance) {
    routerInstance = new ProxyRouter();
  }
  // Always reload routes to pick up changes from CLI
  await routerInstance.loadRoutes();
  return routerInstance;
}

/**
 * Reset the ProxyRouter (for testing)
 */
export function resetProxyRouter(): void {
  routerInstance = null;
}
