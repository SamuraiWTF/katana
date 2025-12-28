/**
 * Reverseproxy plugin for managing nginx reverse proxy configs.
 * Creates/removes nginx config files in sites-available/enabled.
 */

import { getMockState, isMockMode } from "../core/mock-state";
import { ReverseproxyParamsSchema } from "../types/module";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../types/plugin";

const NGINX_SITES_AVAILABLE = "/etc/nginx/sites-available";
const NGINX_SITES_ENABLED = "/etc/nginx/sites-enabled";

export class ReverseproxyPlugin extends BasePlugin {
	readonly name = "reverseproxy";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		// Validate params
		const parsed = ReverseproxyParamsSchema.safeParse(params);
		if (!parsed.success) {
			return this.failure(`Invalid reverseproxy params: ${parsed.error.message}`);
		}

		const { hostname, proxy_pass } = parsed.data;

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
		return this.executeReal(hostname, proxy_pass, isRemove, context);
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

		// Create
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

				context.logger.info(`Removed reverse proxy config: ${hostname}`);
				return this.success(`Removed reverse proxy for ${hostname}`);
			}

			// Create config
			if (!proxyPass) {
				return this.failure("proxy_pass is required for creating reverse proxy");
			}

			const availableFile = Bun.file(availablePath);
			if (await availableFile.exists()) {
				return this.noop(`Reverse proxy for ${hostname} already exists`);
			}

			// Generate nginx config
			const config = this.generateNginxConfig(hostname, proxyPass);

			// Write config to sites-available
			await Bun.write(availablePath, config);

			// Create symlink in sites-enabled
			await Bun.$`ln -sf ${availablePath} ${enabledPath}`.quiet();

			context.logger.info(`Created reverse proxy: ${hostname} -> ${proxyPass}`);
			return this.success(`Created reverse proxy for ${hostname}`);
		} catch (error) {
			return this.failure(
				`reverseproxy failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Generate nginx reverse proxy config
	 */
	private generateNginxConfig(hostname: string, proxyPass: string): string {
		return `server {
    listen 443 ssl;
    server_name ${hostname};

    ssl_certificate /etc/ssl/certs/katana.crt;
    ssl_certificate_key /etc/ssl/private/katana.key;

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

		if (isMockMode()) {
			return getMockState().reverseProxyExists(parsed.data.hostname);
		}

		const availablePath = `${NGINX_SITES_AVAILABLE}/${parsed.data.hostname}`;
		const file = Bun.file(availablePath);
		return file.exists();
	}
}
