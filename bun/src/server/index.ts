/**
 * Main HTTP server using Bun.serve() with native routing
 */

import type { Server } from "bun";

// Server type with default WebSocket data
type HttpServer = Server<undefined>;

import type { Config } from "../types/config";
import {
	createLogger,
	errorHandler,
	getLogger,
	handleCors,
	logRequest,
	logResponse,
	withCors,
} from "./middleware";
import { disableLock, enableLock, getConfig, getLockStatus } from "./routes/config";
import { healthCheck } from "./routes/health";
import {
	getModule,
	getModuleStatus,
	installModule,
	listModules,
	removeModule,
	startModule,
	stopModule,
} from "./routes/modules";
import { getOperation, streamOperation } from "./routes/operations";
import { errorResponse, jsonResponse } from "./types";

// =============================================================================
// Types
// =============================================================================

export interface TlsConfig {
	cert: string;
	key: string;
}

export interface ServerOptions {
	config: Config;
	tls?: TlsConfig;
}

// =============================================================================
// Server Creation
// =============================================================================

/**
 * Create and start the HTTP server
 */
export function createServer(options: ServerOptions): HttpServer {
	const { config, tls } = options;

	// Initialize logger
	createLogger(config);
	const logger = getLogger();

	const protocol = tls ? "https" : "http";
	logger.info({ port: config.server.port, host: config.server.host, tls: !!tls }, "Starting server");

	// Build server config
	const serverConfig: Parameters<typeof Bun.serve>[0] = {
		port: config.server.port,
		hostname: config.server.host,

		// Main request handler
		async fetch(req: Request): Promise<Response> {
			const url = new URL(req.url);
			const path = url.pathname;
			const method = req.method;
			const start = performance.now();

			// Log incoming request
			logRequest(req, path);

			// Handle CORS preflight
			if (method === "OPTIONS" && config.server.cors) {
				const corsResponse = handleCors(config);
				if (corsResponse) {
					return corsResponse;
				}
			}

			try {
				// Route the request
				const response = await routeRequest(req, path, method, config);

				// Add CORS headers if enabled
				const finalResponse = withCors(response, config);

				// Log response
				const duration = performance.now() - start;
				logResponse(req, path, finalResponse.status, duration);

				return finalResponse;
			} catch (error) {
				// Log and handle errors
				const duration = performance.now() - start;
				logger.error({ err: error, path, method }, "Request error");
				logResponse(req, path, 500, duration);

				return withCors(errorHandler(error as Error), config);
			}
		},

		// Global error handler
		error(error: Error): Response {
			return errorHandler(error);
		},
	};

	// Add TLS configuration if provided
	if (tls) {
		serverConfig.tls = {
			cert: Bun.file(tls.cert),
			key: Bun.file(tls.key),
		};
	}

	return Bun.serve(serverConfig);
}

/**
 * Route a request to the appropriate handler
 */
async function routeRequest(
	req: Request,
	path: string,
	method: string,
	_config: Config,
): Promise<Response> {
	// Health check
	if (path === "/health" && method === "GET") {
		return healthCheck();
	}

	// Config endpoint
	if (path === "/api/config" && method === "GET") {
		return getConfig();
	}

	// Lock endpoints
	if (path === "/api/lock") {
		if (method === "GET") return getLockStatus();
		if (method === "POST") return enableLock(req);
		if (method === "DELETE") return disableLock();
	}

	// Module list route
	if (path === "/api/modules" && method === "GET") {
		return listModules(req);
	}

	// Module operation routes: /api/modules/:name/(install|remove|start|stop)
	const moduleOpMatch = path.match(/^\/api\/modules\/([^/]+)\/(install|remove|start|stop)$/);
	if (moduleOpMatch?.[1] && moduleOpMatch[2] && method === "POST") {
		const moduleName = decodeURIComponent(moduleOpMatch[1]);
		const operation = moduleOpMatch[2];

		switch (operation) {
			case "install":
				return installModule(moduleName);
			case "remove":
				return removeModule(moduleName);
			case "start":
				return startModule(moduleName);
			case "stop":
				return stopModule(moduleName);
		}
	}

	// Module status route: /api/modules/:name/status
	const moduleStatusMatch = path.match(/^\/api\/modules\/([^/]+)\/status$/);
	if (moduleStatusMatch?.[1] && method === "GET") {
		const moduleName = decodeURIComponent(moduleStatusMatch[1]);
		return getModuleStatus(moduleName);
	}

	// Module detail route: /api/modules/:name (but not /api/modules/:name/*, handled above)
	const moduleDetailMatch = path.match(/^\/api\/modules\/([^/]+)$/);
	if (moduleDetailMatch?.[1] && method === "GET") {
		const moduleName = decodeURIComponent(moduleDetailMatch[1]);
		return getModule(moduleName);
	}

	// Operation routes
	const operationStreamMatch = path.match(/^\/api\/operations\/([^/]+)\/stream$/);
	if (operationStreamMatch?.[1] && method === "GET") {
		const operationId = decodeURIComponent(operationStreamMatch[1]);
		return streamOperation(operationId);
	}

	const operationMatch = path.match(/^\/api\/operations\/([^/]+)$/);
	if (operationMatch?.[1] && method === "GET") {
		const operationId = decodeURIComponent(operationMatch[1]);
		return getOperation(operationId);
	}

	// 404 for all other routes
	return jsonResponse(errorResponse("NOT_FOUND", `Endpoint not found: ${method} ${path}`), 404);
}

/**
 * Print server startup info
 */
export function printServerInfo(config: Config, tls = false): void {
	const protocol = tls ? "https" : "http";
	const baseUrl = `${protocol}://${config.server.host}:${config.server.port}`;

	console.log("");
	console.log(`Katana API server listening on ${baseUrl}`);
	if (tls) {
		console.log("TLS enabled");
	}
	console.log("");
	console.log("Endpoints:");
	console.log(`  GET  ${baseUrl}/health`);
	console.log(`  GET  ${baseUrl}/api/modules`);
	console.log(`  GET  ${baseUrl}/api/modules/:name`);
	console.log(`  GET  ${baseUrl}/api/modules/:name/status`);
	console.log(`  POST ${baseUrl}/api/modules/:name/install`);
	console.log(`  POST ${baseUrl}/api/modules/:name/remove`);
	console.log(`  POST ${baseUrl}/api/modules/:name/start`);
	console.log(`  POST ${baseUrl}/api/modules/:name/stop`);
	console.log(`  GET  ${baseUrl}/api/operations/:id`);
	console.log(`  GET  ${baseUrl}/api/operations/:id/stream`);
	console.log(`  GET  ${baseUrl}/api/config`);
	console.log(`  GET  ${baseUrl}/api/lock`);
	console.log(`  POST ${baseUrl}/api/lock`);
	console.log(`  DELETE ${baseUrl}/api/lock`);
	console.log("");
	console.log("Press Ctrl+C to stop");
}
