/**
 * Health check endpoint
 */

import type { HealthResponse } from "../types";
import { jsonResponse, successResponse } from "../types";

// Version from package.json
const VERSION = "0.1.0";

/**
 * GET /health - Health check endpoint
 */
export function healthCheck(): Response {
	const data: HealthResponse = {
		status: "ok",
		version: VERSION,
	};

	return jsonResponse(successResponse(data));
}
