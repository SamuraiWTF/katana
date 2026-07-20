import type { Command } from "commander";
import { handleError } from "../cli.ts";
import { getConfigManager } from "../core/config-manager.ts";
import { getProxyRouter } from "../core/proxy-router.ts";
import { startProxyServer } from "../server.ts";
import { getBindAddress } from "../types/config.ts";

/**
 * Register proxy commands
 */
export function registerProxyCommands(program: Command): void {
  const proxy = program.command("proxy").description("Manage the reverse proxy server");

  proxy
    .command("start")
    .description("Start the reverse proxy server (foreground)")
    .action(async () => {
      try {
        await startProxyServer();
      } catch (error) {
        handleError(error);
      }
    });

  proxy
    .command("status")
    .description("Show proxy configuration and routes")
    .action(async () => {
      try {
        const configManager = getConfigManager();
        const config = await configManager.get();
        const router = await getProxyRouter();
        const bindAddress = getBindAddress(config);

        console.log("Proxy Configuration");
        console.log("===================");
        console.log(`Bind Address: ${bindAddress}`);
        console.log(`HTTPS Port:   ${config.proxy.https_port}`);
        console.log(`HTTP Port:    ${config.proxy.http_port}`);
        console.log(`Dashboard:    https://${router.getDashboardHostname()}`);
        console.log(`Network:      ${config.docker_network}`);
        console.log("");

        const routes = router.getRoutes();
        if (routes.size === 0) {
          console.log("No target routes configured.");
          console.log("Install a target with: katana install <target>");
        } else {
          console.log("Configured Routes:");
          for (const [hostname, route] of routes) {
            console.log(`  https://${hostname}`);
            console.log(`    -> ${route.containerName}:${route.port}`);
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
}
