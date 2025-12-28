/**
 * Server middleware helpers for CORS, logging, and error handling
 */

import pino from "pino";
import type { Config } from "../types/config";
import { errorResponse, jsonResponse } from "./types";

// =============================================================================
// Logger
// =============================================================================

let loggerInstance: pino.Logger | null = null;

/**
 * Create or get the logger instance
 */
export function createLogger(config: Config): pino.Logger {
	if (loggerInstance) {
		return loggerInstance;
	}

	const options: pino.LoggerOptions = {
		level: config.log.level,
	};

	// Use pino-pretty for pretty format, otherwise default JSON
	if (config.log.format === "pretty") {
		options.transport = {
			target: "pino-pretty",
			options: {
				colorize: true,
			},
		};
	}

	loggerInstance = pino(options);
	return loggerInstance;
}

/**
 * Get the current logger instance (creates default if not initialized)
 */
export function getLogger(): pino.Logger {
	if (!loggerInstance) {
		loggerInstance = pino({ level: "info" });
	}
	return loggerInstance;
}

/**
 * Reset the logger instance (for testing)
 */
export function resetLogger(): void {
	loggerInstance = null;
}

// =============================================================================
// CORS
// =============================================================================

/**
 * CORS headers for development mode
 */
export function corsHeaders(config: Config): Record<string, string> {
	if (!config.server.cors) {
		return {};
	}

	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	};
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(config: Config): Response | null {
	if (!config.server.cors) {
		return null;
	}

	return new Response(null, {
		status: 204,
		headers: corsHeaders(config),
	});
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Global error handler for unhandled errors
 */
export function errorHandler(error: Error): Response {
	const logger = getLogger();
	logger.error({ err: error }, "Unhandled server error");

	const isDev = process.env.NODE_ENV === "development";

	return jsonResponse(
		errorResponse(
			"INTERNAL_ERROR",
			"An internal server error occurred",
			isDev ? error.message : undefined,
		),
		500,
	);
}

// =============================================================================
// Request Logging
// =============================================================================

/**
 * Log an incoming request
 */
export function logRequest(req: Request, path: string): void {
	const logger = getLogger();
	logger.info(
		{
			method: req.method,
			path,
			userAgent: req.headers.get("user-agent"),
		},
		"Request received",
	);
}

/**
 * Log a response
 */
export function logResponse(req: Request, path: string, status: number, duration: number): void {
	const logger = getLogger();
	const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

	logger[level](
		{
			method: req.method,
			path,
			status,
			duration: `${duration.toFixed(2)}ms`,
		},
		"Request completed",
	);
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Add CORS headers to a response if enabled
 */
export function withCors(response: Response, config: Config): Response {
	if (!config.server.cors) {
		return response;
	}

	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders(config))) {
		headers.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
