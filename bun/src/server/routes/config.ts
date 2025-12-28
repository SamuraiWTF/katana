/**
 * Config and Lock REST API endpoints
 */

import { ConfigManager } from "../../core/config-manager";
import { StateManager } from "../../core/state-manager";
import {
	type ConfigResponse,
	errorResponse,
	jsonResponse,
	type LockStatusResponse,
	successResponse,
} from "../types";

// =============================================================================
// Config
// =============================================================================

/**
 * GET /api/config - Get current configuration (sanitized)
 */
export async function getConfig(): Promise<Response> {
	const configManager = ConfigManager.getInstance();
	const config = await configManager.loadConfig();

	const response: ConfigResponse = {
		domainBase: config.domainBase,
		serverPort: config.server.port,
		serverHost: config.server.host,
	};

	return jsonResponse(successResponse(response));
}

// =============================================================================
// Lock Status
// =============================================================================

/**
 * GET /api/lock - Get lock status
 */
export async function getLockStatus(): Promise<Response> {
	const stateManager = StateManager.getInstance();
	const lockState = await stateManager.getLockState();

	const response: LockStatusResponse = {
		locked: lockState.locked,
		modules: lockState.modules,
		lockedAt: lockState.lockedAt,
		lockedBy: lockState.lockedBy,
		message: lockState.message,
	};

	return jsonResponse(successResponse(response));
}

/**
 * POST /api/lock - Enable lock mode
 */
export async function enableLock(req: Request): Promise<Response> {
	const stateManager = StateManager.getInstance();

	// Check if already locked
	if (await stateManager.isLocked()) {
		const state = await stateManager.getLockState();
		return jsonResponse(
			errorResponse(
				"VALIDATION_ERROR",
				`System is already locked${state.lockedBy ? ` by ${state.lockedBy}` : ""}`,
			),
			400,
		);
	}

	// Parse request body for message
	let message: string | undefined;
	try {
		const body = (await req.json()) as Record<string, unknown>;
		if (typeof body.message === "string") {
			message = body.message;
		}
	} catch {
		// No body or invalid JSON - that's okay
	}

	await stateManager.enableLock({
		message,
		lockedBy: process.env.USER ?? "api",
	});

	const lockState = await stateManager.getLockState();

	const response: LockStatusResponse = {
		locked: true,
		modules: lockState.modules,
		lockedAt: lockState.lockedAt,
		lockedBy: lockState.lockedBy,
		message: lockState.message,
	};

	return jsonResponse(successResponse(response));
}

/**
 * DELETE /api/lock - Disable lock mode
 */
export async function disableLock(): Promise<Response> {
	const stateManager = StateManager.getInstance();

	// Check if not locked
	if (!(await stateManager.isLocked())) {
		return jsonResponse(errorResponse("VALIDATION_ERROR", "System is not locked"), 400);
	}

	await stateManager.disableLock();

	const response: LockStatusResponse = {
		locked: false,
		modules: [],
	};

	return jsonResponse(successResponse(response));
}
