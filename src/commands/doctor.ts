import type { Command } from "commander";
import { getCertManager } from "../core/cert-manager.ts";
import { getConfigManager } from "../core/config-manager.ts";
import { getDockerClient } from "../core/docker-client.ts";
import { getModuleLoader } from "../core/module-loader.ts";
import { getStateManager } from "../core/state-manager.ts";
import { getDnsManager } from "../platform/linux/dns-manager.ts";
import { getDashboardHostname, getTargetHostname } from "../types/config.ts";
import { DockerNotRunningError, DockerPermissionError } from "../types/errors.ts";
import { logger } from "../utils/logger.ts";

/**
 * Result of a single health check
 */
interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  help?: string;
}

/**
 * Run all health checks and return results
 */
async function runHealthChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const dockerClient = getDockerClient();
  const certManager = getCertManager();
  const stateManager = getStateManager();
  const configManager = getConfigManager();
  const dnsManager = getDnsManager();
  const config = await configManager.get();

  // 1. Docker daemon running
  const dockerRunning = await dockerClient.ping();
  results.push({
    name: "Docker daemon",
    passed: dockerRunning,
    message: dockerRunning ? "Docker daemon running" : "Docker daemon not running",
    help: dockerRunning ? undefined : "sudo systemctl start docker",
  });

  // Skip remaining Docker checks if daemon not running
  if (!dockerRunning) {
    results.push({
      name: "Docker permissions",
      passed: false,
      message: "Skipped (Docker not running)",
    });
    results.push({
      name: "Docker network",
      passed: false,
      message: "Skipped (Docker not running)",
    });
  } else {
    // 2. Docker permissions
    let hasPermissions = false;
    let permissionError = "";
    try {
      await dockerClient.checkPermissions();
      hasPermissions = true;
    } catch (error) {
      if (error instanceof DockerNotRunningError) {
        permissionError = "Docker not running";
      } else if (error instanceof DockerPermissionError) {
        permissionError = "Permission denied";
      } else {
        permissionError = String(error);
      }
    }
    results.push({
      name: "Docker permissions",
      passed: hasPermissions,
      message: hasPermissions ? "User has Docker permissions" : permissionError,
      help: hasPermissions ? undefined : "sudo usermod -aG docker $USER && newgrp docker",
    });

    // 3. Docker network exists
    const networkExists = await dockerClient.networkExists(config.docker_network);
    results.push({
      name: "Docker network",
      passed: networkExists,
      message: networkExists
        ? `Docker network '${config.docker_network}' exists`
        : `Docker network '${config.docker_network}' missing`,
      help: networkExists ? undefined : "Network will be created when you install a target",
    });
  }

  // 4. OpenSSL available
  const opensslAvailable = await checkOpenSSL();
  results.push({
    name: "OpenSSL",
    passed: opensslAvailable,
    message: opensslAvailable ? "OpenSSL available" : "OpenSSL not found",
    help: opensslAvailable ? undefined : "sudo apt install openssl",
  });

  // 5. CA initialized
  const caInitialized = await certManager.isInitialized();
  results.push({
    name: "Certificates initialized",
    passed: caInitialized,
    message: caInitialized ? "Certificates initialized" : "Certificates not initialized",
    help: caInitialized ? undefined : "katana cert init",
  });

  // 6 & 7. Certificates valid and expiration
  if (caInitialized) {
    const certsValid = await certManager.validateCerts();
    const daysUntilExpiry = await certManager.daysUntilExpiration();

    if (certsValid) {
      // Check for expiration warning
      if (daysUntilExpiry <= 30) {
        results.push({
          name: "Certificates valid",
          passed: true,
          message: `Certificates valid (expires in ${daysUntilExpiry} days - renew soon!)`,
          help: "katana cert renew",
        });
      } else {
        results.push({
          name: "Certificates valid",
          passed: true,
          message: `Certificates valid (expires in ${daysUntilExpiry} days)`,
        });
      }
    } else {
      results.push({
        name: "Certificates valid",
        passed: false,
        message: daysUntilExpiry < 0 ? "Certificates expired" : "Certificates invalid",
        help: "katana cert renew",
      });
    }
  } else {
    results.push({
      name: "Certificates valid",
      passed: false,
      message: "Skipped (certificates not initialized)",
    });
  }

  // 8. Port 443 capability
  const portCapability = await checkPortCapability();
  results.push({
    name: "Port 443 capability",
    passed: portCapability,
    message: portCapability ? "Port 443 bindable" : "Missing port binding capability",
    help: portCapability ? undefined : "sudo katana setup-proxy",
  });

  // 9. DNS sync check
  try {
    const state = await stateManager.get();
    const moduleLoader = await getModuleLoader();
    const expectedHostnames = new Set<string>();

    // Collect all expected hostnames from installed targets
    // IMPORTANT: Recompute hostnames using current config, not stale state routes
    // This handles config changes like switching from .test to .localhost
    for (const target of state.targets) {
      const module = await moduleLoader.findModule(target.name);
      if (module && module.category === "targets") {
        for (const proxy of module.proxy) {
          const hostname = getTargetHostname(config, proxy.hostname);
          expectedHostnames.add(hostname);
        }
      }
    }

    // Add dashboard hostname (using the same utility function as dns sync)
    const dashboardHostname = getDashboardHostname(config);
    expectedHostnames.add(dashboardHostname);

    // Get current managed entries
    const managedEntries = await dnsManager.listManaged();
    const currentHostnames = new Set(managedEntries.map((e) => e.hostname));

    // Compare sets
    const missing = [...expectedHostnames].filter((h) => !currentHostnames.has(h));
    const extra = [...currentHostnames].filter((h) => !expectedHostnames.has(h));

    // Only fail if expected entries are missing
    // Extra entries (e.g., from using --all flag) are harmless
    const allPresent = missing.length === 0;
    const totalExpected = expectedHostnames.size;
    const totalPresent = totalExpected - missing.length;

    let message: string;
    if (allPresent && extra.length === 0) {
      message = `DNS entries in sync (${totalPresent}/${totalExpected})`;
    } else if (allPresent && extra.length > 0) {
      message = `DNS entries present (${totalPresent}/${totalExpected}, ${extra.length} extra)`;
    } else {
      message = `DNS entries missing (${totalPresent}/${totalExpected})`;
    }

    results.push({
      name: "DNS entries",
      passed: allPresent,
      message,
      help: allPresent ? undefined : "sudo katana dns sync",
    });
  } catch {
    results.push({
      name: "DNS entries",
      passed: false,
      message: "Could not check DNS entries",
      help: "Check /etc/hosts permissions",
    });
  }

  // 10. State file valid
  try {
    await stateManager.get();
    results.push({
      name: "State file",
      passed: true,
      message: "State file valid",
    });
  } catch (error) {
    results.push({
      name: "State file",
      passed: false,
      message: `State file error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return results;
}

/**
 * Check if OpenSSL is available
 */
async function checkOpenSSL(): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", "openssl"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Check if binary has cap_net_bind_service capability
 */
async function checkPortCapability(): Promise<boolean> {
  try {
    // Check if we're running as root (always allowed)
    if (process.getuid?.() === 0) {
      return true;
    }

    // Try to resolve the actual binary path
    // 1. Try 'which katana' if it's in PATH
    // 2. Try reading /proc/self/exe (Linux)
    // 3. Fall back to Bun.main
    let katanaPath: string | undefined;

    // Try 'which' first
    try {
      const whichProc = Bun.spawn(["which", "katana"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await whichProc.exited;
      const output = await new Response(whichProc.stdout).text();
      if (exitCode === 0 && output.trim()) {
        katanaPath = output.trim();
      }
    } catch {
      // which command failed
    }

    // If which didn't work, use process.argv[1]
    // When running compiled binary with full path, this gives us the actual path
    if (!katanaPath && process.argv[1]) {
      // Resolve to absolute path if needed
      try {
        const resolveProc = Bun.spawn(["realpath", process.argv[1]], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const exitCode = await resolveProc.exited;
        const output = await new Response(resolveProc.stdout).text();
        if (exitCode === 0 && output.trim()) {
          katanaPath = output.trim();
        }
      } catch {
        // If realpath fails, use argv[1] as-is
        katanaPath = process.argv[1];
      }
    }

    // Last resort: try Bun.main
    if (!katanaPath) {
      katanaPath = Bun.main;
    }

    // If we still don't have a path, try the port binding test
    if (!katanaPath) {
      return await tryBindPort443();
    }

    // Check getcap on the executable
    const proc = Bun.spawn(["getcap", katanaPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0 || !stdout.trim()) {
      // getcap failed or returned empty output (path doesn't exist), try alternative check
      return await tryBindPort443();
    }

    // Check if cap_net_bind_service is in the output
    return stdout.includes("cap_net_bind_service");
  } catch {
    // Fallback: try to actually bind to port 443
    return await tryBindPort443();
  }
}

/**
 * Try to bind to port 443 to check capability
 */
async function tryBindPort443(): Promise<boolean> {
  try {
    const server = Bun.serve({
      port: 443,
      fetch() {
        return new Response("test");
      },
    });
    server.stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * Register the doctor command
 */
export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run health checks on the system")
    .option("--json", "Output results as JSON")
    .action(async (options: { json?: boolean }) => {
      const results = await runHealthChecks();

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log("Katana Health Check");
        console.log("===================\n");

        for (const result of results) {
          if (result.passed) {
            logger.success(result.message);
          } else {
            logger.error(result.message);
            if (result.help) {
              console.log(`  → Fix: ${result.help}`);
            }
          }
        }

        const passed = results.filter((r) => r.passed).length;
        const total = results.length;

        console.log(`\nHealth: ${passed}/${total} checks passed`);

        if (passed < total) {
          process.exit(1);
        }
      }
    });
}
