/**
 * Module REST API endpoints
 */

import { loadAllModules, loadModule } from "../../core/module-loader";
import { StateManager } from "../../core/state-manager";
import { StatusChecker } from "../../core/status";
import type { ModuleCategory } from "../../types/module";
import type { Operation } from "../../types/plugin";
import { ModuleStatus } from "../../types/status";
import { OperationManager } from "../operations";
import {
	errorResponse,
	jsonResponse,
	type ModuleDetail,
	type ModuleListItem,
	type ModuleListResponse,
	type OperationResponse,
	successResponse,
} from "../types";

// =============================================================================
// Lock Mode Helpers
// =============================================================================

/**
 * Check if a module is accessible when the system is locked.
 * Returns true if not locked, or if the module is in the locked list.
 */
function isModuleAccessibleWhenLocked(
	name: string,
	lockState: { locked: boolean; modules: string[] },
): boolean {
	if (!lockState.locked) return true;
	const lockedNames = new Set(lockState.modules.map((m) => m.toLowerCase()));
	return lockedNames.has(name.toLowerCase());
}

// =============================================================================
// List Modules
// =============================================================================

/**
 * GET /api/modules - List all modules with optional category filter
 * Query params:
 *   - category: Filter by category (targets, tools, base, management)
 */
export async function listModules(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const categoryParam = url.searchParams.get("category");

	// Validate category if provided
	const validCategories = ["targets", "tools", "base", "management"];
	if (categoryParam && !validCategories.includes(categoryParam)) {
		return jsonResponse(
			errorResponse(
				"VALIDATION_ERROR",
				`Invalid category: ${categoryParam}. Valid: ${validCategories.join(", ")}`,
			),
			400,
		);
	}

	// Check lock state
	const stateManager = StateManager.getInstance();
	const lockState = await stateManager.getLockState();

	// Load modules with optional category filter
	const loaderOptions = categoryParam ? { category: categoryParam as ModuleCategory } : {};
	const result = await loadAllModules(loaderOptions);

	if (!result.success && result.modules.length === 0) {
		return jsonResponse(errorResponse("INTERNAL_ERROR", "Failed to load modules"), 500);
	}

	// Filter to locked modules if in lock mode
	let modules = result.modules;
	if (lockState.locked) {
		const lockedNames = new Set(lockState.modules.map((m) => m.toLowerCase()));
		modules = modules.filter((m) => lockedNames.has(m.name.toLowerCase()));
	}

	// Get status for all modules
	const statusChecker = new StatusChecker();
	const statusMap = await statusChecker.checkStatusBatch(modules);

	// Build response
	const items: ModuleListItem[] = modules
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((m) => {
			const statusResult = statusMap.get(m.name.toLowerCase());
			return {
				name: m.name,
				category: m.category,
				description: m.description,
				href: m.href,
				status: statusResult?.status ?? ModuleStatus.UNKNOWN,
				dependsOn: m["depends-on"],
			};
		});

	const response: ModuleListResponse = {
		modules: items,
		locked: lockState.locked,
		lockMessage: lockState.message,
	};

	return jsonResponse(successResponse(response));
}

// =============================================================================
// Get Single Module
// =============================================================================

/**
 * GET /api/modules/:name - Get single module details
 */
export async function getModule(name: string): Promise<Response> {
	// Check lock state - only allow access to locked modules when locked
	const stateManager = StateManager.getInstance();
	const lockState = await stateManager.getLockState();

	if (!isModuleAccessibleWhenLocked(name, lockState)) {
		return jsonResponse(errorResponse("NOT_FOUND", `Module not found: ${name}`), 404);
	}

	const result = await loadModule(name);

	if (!result.success || !result.module) {
		return jsonResponse(errorResponse("NOT_FOUND", `Module not found: ${name}`), 404);
	}

	const mod = result.module;

	// Get status
	const statusChecker = new StatusChecker();
	const statusResult = await statusChecker.checkStatus(mod);

	const detail: ModuleDetail = {
		name: mod.name,
		category: mod.category,
		description: mod.description,
		href: mod.href,
		status: statusResult.status,
		dependsOn: mod["depends-on"],
		hasInstallTasks: Array.isArray(mod.install) && mod.install.length > 0,
		hasRemoveTasks: Array.isArray(mod.remove) && mod.remove.length > 0,
		hasStartTasks: Array.isArray(mod.start) && mod.start.length > 0,
		hasStopTasks: Array.isArray(mod.stop) && mod.stop.length > 0,
	};

	return jsonResponse(successResponse(detail));
}

// =============================================================================
// Get Module Status
// =============================================================================

/**
 * GET /api/modules/:name/status - Get module status
 */
export async function getModuleStatus(name: string): Promise<Response> {
	// Check lock state - only allow access to locked modules when locked
	const stateManager = StateManager.getInstance();
	const lockState = await stateManager.getLockState();

	if (!isModuleAccessibleWhenLocked(name, lockState)) {
		return jsonResponse(errorResponse("NOT_FOUND", `Module not found: ${name}`), 404);
	}

	const result = await loadModule(name);

	if (!result.success || !result.module) {
		return jsonResponse(errorResponse("NOT_FOUND", `Module not found: ${name}`), 404);
	}

	const statusChecker = new StatusChecker();
	const statusResult = await statusChecker.checkStatus(result.module);

	// Get installation info
	const installInfo = await stateManager.getModuleInstallInfo(name);

	return jsonResponse(
		successResponse({
			module: name,
			status: statusResult.status,
			installed: statusResult.installed,
			running: statusResult.running,
			installedAt: installInfo?.installedAt,
		}),
	);
}

// =============================================================================
// Module Operations (install/remove/start/stop)
// =============================================================================

/**
 * Start a module operation
 */
async function startOperation(name: string, operation: Operation): Promise<Response> {
	// Check if module exists
	const result = await loadModule(name);
	if (!result.success || !result.module) {
		return jsonResponse(errorResponse("NOT_FOUND", `Module not found: ${name}`), 404);
	}

	// Check lock mode - acts as rudimentary auth
	const stateManager = StateManager.getInstance();
	const lockState = await stateManager.getLockState();

	if (lockState.locked) {
		// Block install/remove entirely when locked
		if (operation === "install" || operation === "remove") {
			return jsonResponse(
				errorResponse(
					"LOCKED",
					lockState.message
						? `System is locked: ${lockState.message}`
						: "System is locked. Cannot modify modules.",
				),
				403,
			);
		}

		// For start/stop, only allow on locked (installed) modules
		if (!isModuleAccessibleWhenLocked(name, lockState)) {
			return jsonResponse(errorResponse("NOT_FOUND", `Module not found: ${name}`), 404);
		}
	}

	// Check for operation in progress
	const operationManager = OperationManager.getInstance();
	if (operationManager.hasOperationInProgress(name)) {
		return jsonResponse(
			errorResponse("OPERATION_IN_PROGRESS", `Operation already in progress for module: ${name}`),
			409,
		);
	}

	// Create and start operation
	const tracked = await operationManager.createOperation(name, operation);

	const response: OperationResponse = {
		operationId: tracked.id,
		module: name,
		operation,
		status: tracked.status,
		startedAt: tracked.startedAt.toISOString(),
	};

	return jsonResponse(successResponse(response), 202);
}

/**
 * POST /api/modules/:name/install - Install a module
 */
export async function installModule(name: string): Promise<Response> {
	return startOperation(name, "install");
}

/**
 * POST /api/modules/:name/remove - Remove a module
 */
export async function removeModule(name: string): Promise<Response> {
	return startOperation(name, "remove");
}

/**
 * POST /api/modules/:name/start - Start a module
 */
export async function startModule(name: string): Promise<Response> {
	return startOperation(name, "start");
}

/**
 * POST /api/modules/:name/stop - Stop a module
 */
export async function stopModule(name: string): Promise<Response> {
	return startOperation(name, "stop");
}
