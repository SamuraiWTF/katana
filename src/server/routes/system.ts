/**
 * API routes for system status and management
 */

import { getCertManager } from "../../core/cert-manager.ts";
import { getConfigManager } from "../../core/config-manager.ts";
import { getDockerClient } from "../../core/docker-client.ts";
import { getProxyRouter } from "../../core/proxy-router.ts";
import { getStateManager } from "../../core/state-manager.ts";
import { getDnsManager } from "../../platform/index.ts";
import { getBindAddress, getDashboardHostname } from "../../types/config.ts";

// =============================================================================
// Types
// =============================================================================

interface SystemStatusResponse {
  success: true;
  data: {
    prerequisites: {
      docker: {
        installed: boolean;
        version: string | null;
        daemonRunning: boolean;
        userCanConnect: boolean;
      };
    };
    system: {
      os: string;
      kernel: string;
      uptime: string;
      memory: {
        total: number;
        used: number;
        percentUsed: number;
      };
      disk: {
        path: string;
        total: number;
        used: number;
        percentUsed: number;
      };
    };
    katana: {
      certs: {
        valid: boolean;
        expiresAt: string | null;
        daysUntilExpiration: number | null;
      };
      proxy: {
        running: boolean;
        routeCount: number;
        bindAddress: string;
      };
      dns: {
        inSync: boolean;
        managedCount: number;
        expectedCount: number;
      } | null;
    };
  };
}

interface ErrorResponse {
  success: false;
  error: string;
}

// =============================================================================
// Helpers
// =============================================================================

async function getDockerVersion(): Promise<string | null> {
  try {
    const proc = Bun.spawn(["docker", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // Parse "Docker version 24.0.7, build afdd53b"
    const match = output.match(/Docker version ([0-9.]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function getSystemInfo(): Promise<{
  os: string;
  kernel: string;
  uptime: string;
  memory: { total: number; used: number; percentUsed: number };
  disk: { path: string; total: number; used: number; percentUsed: number };
}> {
  // Get OS info
  const unameProc = Bun.spawn(["uname", "-s"], { stdout: "pipe" });
  const os = (await new Response(unameProc.stdout).text()).trim();
  await unameProc.exited;

  // Get kernel version
  const kernelProc = Bun.spawn(["uname", "-r"], { stdout: "pipe" });
  const kernel = (await new Response(kernelProc.stdout).text()).trim();
  await kernelProc.exited;

  // Get uptime
  let uptime = "unknown";
  try {
    const uptimeProc = Bun.spawn(["uptime", "-p"], { stdout: "pipe" });
    uptime = (await new Response(uptimeProc.stdout).text()).trim().replace("up ", "");
    await uptimeProc.exited;
  } catch {
    // uptime -p not available on all systems
  }

  // Get memory info (using free -b for bytes)
  let memory = { total: 0, used: 0, percentUsed: 0 };
  try {
    const memProc = Bun.spawn(["free", "-b"], { stdout: "pipe" });
    const memOutput = await new Response(memProc.stdout).text();
    await memProc.exited;

    // Parse: "Mem:    16000000  8000000  ..."
    const memLine = memOutput.split("\n").find((l) => l.startsWith("Mem:"));
    if (memLine) {
      const parts = memLine.split(/\s+/).filter((p) => p);
      const total = Number.parseInt(parts[1] || "0", 10);
      const used = Number.parseInt(parts[2] || "0", 10);
      memory = {
        total,
        used,
        percentUsed: total > 0 ? Math.round((used / total) * 100) : 0,
      };
    }
  } catch {
    // Ignore errors
  }

  // Get disk info (for /)
  let disk = { path: "/", total: 0, used: 0, percentUsed: 0 };
  try {
    const dfProc = Bun.spawn(["df", "-B1", "/"], { stdout: "pipe" });
    const dfOutput = await new Response(dfProc.stdout).text();
    await dfProc.exited;

    // Parse: "Filesystem  1B-blocks Used Available Use% Mounted"
    const lines = dfOutput.split("\n").filter((l) => l && !l.startsWith("Filesystem"));
    if (lines[0]) {
      const parts = lines[0].split(/\s+/).filter((p) => p);
      disk = {
        path: "/",
        total: Number.parseInt(parts[1] || "0", 10),
        used: Number.parseInt(parts[2] || "0", 10),
        percentUsed: Number.parseInt((parts[4] || "0").replace("%", ""), 10),
      };
    }
  } catch {
    // Ignore errors
  }

  return { os, kernel, uptime, memory, disk };
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * GET /api/system
 * Get system status including Docker, certs, DNS
 */
export async function handleGetSystem(_req: Request): Promise<Response> {
  try {
    const docker = getDockerClient();
    const certManager = getCertManager();
    const configManager = getConfigManager();
    const stateManager = getStateManager();
    const config = await configManager.get();

    // Docker status
    const dockerVersion = await getDockerVersion();
    const daemonRunning = await docker.ping();
    let userCanConnect = false;
    try {
      await docker.checkPermissions();
      userCanConnect = true;
    } catch {
      userCanConnect = false;
    }

    // System info
    const systemInfo = await getSystemInfo();

    // Certificate status
    let certsValid = false;
    let certsExpiresAt: string | null = null;
    let daysUntilExpiration: number | null = null;

    try {
      certsValid = await certManager.validateCerts();
      if (certsValid) {
        daysUntilExpiration = await certManager.daysUntilExpiration();
        if (daysUntilExpiration !== null) {
          const expiresDate = new Date();
          expiresDate.setDate(expiresDate.getDate() + daysUntilExpiration);
          certsExpiresAt = expiresDate.toISOString();
        }
      }
    } catch {
      // Certs not initialized
    }

    // Proxy status (we're running if this endpoint is accessible)
    const router = await getProxyRouter();
    const routes = router.getRoutes();
    const bindAddress = getBindAddress(config);

    // DNS status (only for local installs)
    let dnsStatus: SystemStatusResponse["data"]["katana"]["dns"] = null;

    if (config.install_type === "local") {
      try {
        const dnsManager = getDnsManager();
        const managedEntries = await dnsManager.listManaged();
        const state = await stateManager.get();

        // Build list of expected hostnames (dashboard + installed targets)
        const expectedHostnames: string[] = [getDashboardHostname(config)];
        for (const target of state.targets) {
          for (const route of target.routes) {
            expectedHostnames.push(route.hostname);
          }
        }

        // Check if all expected hostnames exist in managed entries
        // Extra entries are OK (e.g., from `dns sync --all`)
        const managedHostnames = new Set(managedEntries.map((e) => e.hostname));
        const allExpectedPresent = expectedHostnames.every((h) => managedHostnames.has(h));

        dnsStatus = {
          inSync: allExpectedPresent,
          managedCount: managedEntries.length,
          expectedCount: expectedHostnames.length,
        };
      } catch {
        // DNS check failed
        dnsStatus = {
          inSync: false,
          managedCount: 0,
          expectedCount: 0,
        };
      }
    }

    const response: SystemStatusResponse = {
      success: true,
      data: {
        prerequisites: {
          docker: {
            installed: dockerVersion !== null,
            version: dockerVersion,
            daemonRunning,
            userCanConnect,
          },
        },
        system: systemInfo,
        katana: {
          certs: {
            valid: certsValid,
            expiresAt: certsExpiresAt,
            daysUntilExpiration,
          },
          proxy: {
            running: true, // If this endpoint responds, proxy is running
            routeCount: routes.size,
            bindAddress,
          },
          dns: dnsStatus,
        },
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
 * POST /api/system/lock
 * Lock the system to prevent install/remove operations
 */
export async function handleLock(_req: Request): Promise<Response> {
  try {
    const stateManager = getStateManager();
    await stateManager.update((state) => ({
      ...state,
      locked: true,
      last_updated: new Date().toISOString(),
    }));

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = { success: false, error: message };
    return Response.json(response, { status: 500 });
  }
}

/**
 * POST /api/system/unlock
 * Unlock the system to allow install/remove operations
 */
export async function handleUnlock(_req: Request): Promise<Response> {
  try {
    const stateManager = getStateManager();
    await stateManager.update((state) => ({
      ...state,
      locked: false,
      last_updated: new Date().toISOString(),
    }));

    return Response.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response: ErrorResponse = { success: false, error: message };
    return Response.json(response, { status: 500 });
  }
}
