/**
 * Reverseproxy plugin for managing nginx reverse proxy configs.
 * Creates/removes nginx config files in sites-available/enabled.
 *
 * Features:
 * - Domain transformation: hostname prefix + configured domainBase
 * - Wildcard certificate from statePath
 * - HTTP→HTTPS redirect
 * - Nginx reload after config changes
 */

import { CertManager } from "../core/cert-manager";
import { ConfigManager } from "../core/config-manager";
import { getMockState, isMockMode } from "../core/mock-state";
import { ReverseproxyParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

const NGINX_SITES_AVAILABLE = "/etc/nginx/sites-available";
const NGINX_SITES_ENABLED = "/etc/nginx/sites-enabled";

export class ReverseproxyPlugin extends BasePlugin {
	readonly name = "reverseproxy";

	/**
	 * Transform module hostname to use configured domainBase
	 * e.g., "juice-shop.wtf" with domainBase "abcde.penlabs.net" → "juice-shop.abcde.penlabs.net"
	 */
	private transformHostname(moduleHostname: string, domainBase: string): string {
		// Extract prefix (everything before first dot)
		const prefix = moduleHostname.split(".")[0];
		return `${prefix}.${domainBase}`;
	}

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = ReverseproxyParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid reverseproxy params: ${parsed.error.message}`);
		}

		const { hostname: moduleHostname, proxy_pass } = parsed.data;

		// Load config to get domainBase
		const configManager = ConfigManager.getInstance();
		const config = await configManager.loadConfig();

		// Transform hostname using domainBase
		const hostname = this.transformHostname(moduleHostname, config.domainBase);

		// Determine action from operation context
		const isRemove = context.operation === "remove";

		// Mock mode
		if (context.mock || isMockMode()) {
			return this.executeMock(hostname, proxy_pass, isRemove, context);
		}

		// Dry run mode
		if (context.dryRun) {
			const action = isRemove ? "remove" : "create";
			context.logger.info(`[dry-run] reverseproxy ${action}: ${hostname}`);
			return this.noop(`Would ${action} reverse proxy for ${hostname}`);
		}

		// Real execution
		return this.executeReal(hostname, proxy_pass, isRemove, context, config.statePath);
	}

	/**
	 * Execute in mock mode using MockState
	 */
	private async executeMock(
		hostname: string,
		proxyPass: string | undefined,
		isRemove: boolean,
		context: ExecutionContext,
	): Promise<PluginResult> {
		const mock = getMockState();

		if (isRemove) {
			if (!mock.reverseProxyExists(hostname)) {
				return this.noop(`Reverse proxy for ${hostname} does not exist`);
			}
			mock.removeReverseProxy(hostname);
			context.logger.info(`[mock] Removed reverse proxy: ${hostname}`);
			return this.success(`Removed reverse proxy for ${hostname}`);
		}

		// Create - check if certs exist
		if (!mock.hasCerts()) {
			return this.failure(
				"Certificates not initialized. Run 'katana cert init' first.",
			);
		}

		if (mock.reverseProxyExists(hostname)) {
			return this.noop(`Reverse proxy for ${hostname} already exists`);
		}
		mock.addReverseProxy(hostname, proxyPass);
		context.logger.info(`[mock] Created reverse proxy: ${hostname} -> ${proxyPass}`);
		return this.success(`Created reverse proxy for ${hostname}`);
	}

	/**
	 * Execute real nginx config operations
	 */
	private async executeReal(
		hostname: string,
		proxyPass: string | undefined,
		isRemove: boolean,
		context: ExecutionContext,
		statePath: string,
	): Promise<PluginResult> {
		const availablePath = `${NGINX_SITES_AVAILABLE}/${hostname}`;
		const enabledPath = `${NGINX_SITES_ENABLED}/${hostname}`;

		try {
			if (isRemove) {
				// Remove symlink and config file
				const enabledFile = Bun.file(enabledPath);
				const availableFile = Bun.file(availablePath);

				if (!(await availableFile.exists())) {
					return this.noop(`Reverse proxy for ${hostname} does not exist`);
				}

				// Remove symlink if exists
				if (await enabledFile.exists()) {
					await Bun.$`rm ${enabledPath}`.quiet();
				}

				// Remove config file
				await Bun.$`rm ${availablePath}`.quiet();

				// Reload nginx
				await this.reloadNginx(context);

				context.logger.info(`Removed reverse proxy config: ${hostname}`);
				return this.success(`Removed reverse proxy for ${hostname}`);
			}

			// Create config
			if (!proxyPass) {
				return this.failure("proxy_pass is required for creating reverse proxy");
			}

			// Check if certificates exist
			const certManager = CertManager.getInstance();
			certManager.setStatePath(statePath);

			if (!(await certManager.hasCerts())) {
				return this.failure(
					"Certificates not initialized. Run 'katana cert init' first.",
				);
			}

			const availableFile = Bun.file(availablePath);
			if (await availableFile.exists()) {
				return this.noop(`Reverse proxy for ${hostname} already exists`);
			}

			// Get certificate paths
			const certPaths = certManager.getCertPaths();

			// Generate nginx config
			const config = this.generateNginxConfig(hostname, proxyPass, certPaths.cert, certPaths.key);

			// Write config to sites-available
			await Bun.write(availablePath, config);

			// Create symlink in sites-enabled
			await Bun.$`ln -sf ${availablePath} ${enabledPath}`.quiet();

			// Reload nginx
			await this.reloadNginx(context);

			context.logger.info(`Created reverse proxy: ${hostname} -> ${proxyPass}`);
			return this.success(`Created reverse proxy for ${hostname}`);
		} catch (error) {
			return this.failure(
				`reverseproxy failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Reload nginx configuration
	 */
	private async reloadNginx(context: ExecutionContext): Promise<void> {
		try {
			// Check if nginx is installed
			try {
				await Bun.$`which nginx`.quiet();
			} catch {
				context.logger.warn("nginx not found, skipping reload");
				return;
			}

			// Test configuration
			const testResult = await Bun.$`nginx -t`.quiet();
			if (testResult.exitCode !== 0) {
				context.logger.warn(`nginx config test failed: ${testResult.stderr}`);
				return;
			}

			// Reload nginx - try systemctl first, fall back to nginx -s reload
			try {
				await Bun.$`systemctl reload nginx`.quiet();
				context.logger.info("Nginx reloaded via systemctl");
			} catch {
				// systemctl might not be available, try direct reload
				await Bun.$`nginx -s reload`.quiet();
				context.logger.info("Nginx reloaded via nginx -s reload");
			}
		} catch (error) {
			context.logger.warn(
				`Failed to reload nginx: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Generate nginx reverse proxy config with HTTP→HTTPS redirect
	 */
	private generateNginxConfig(
		hostname: string,
		proxyPass: string,
		certPath: string,
		keyPath: string,
	): string {
		return `# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name ${hostname};
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    server_name ${hostname};

    ssl_certificate ${certPath};
    ssl_certificate_key ${keyPath};

    location / {
        proxy_pass ${proxyPass};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
	}

	/**
	 * Check if reverse proxy config exists
	 */
	async exists(params: unknown): Promise<boolean> {
		const parsed = ReverseproxyParamsSchema.safeParse(params);
		if (!parsed.success) {
			return false;
		}

		// Load config to get domainBase
		const configManager = ConfigManager.getInstance();
		const config = await configManager.loadConfig();

		// Transform hostname
		const hostname = this.transformHostname(parsed.data.hostname, config.domainBase);

		if (isMockMode()) {
			return getMockState().reverseProxyExists(hostname);
		}

		const availablePath = `${NGINX_SITES_AVAILABLE}/${hostname}`;
		const file = Bun.file(availablePath);
		return file.exists();
	}
}
