/**
 * API response types for the REST server
 */

import { z } from "zod";
import type { ModuleCategory } from "../types/module";
import type { Operation } from "../types/plugin";
import type { ModuleStatus } from "../types/status";

// =============================================================================
// Error Types
// =============================================================================

export const ApiErrorCode = z.enum([
	"LOCKED",
	"NOT_FOUND",
	"OPERATION_IN_PROGRESS",
	"VALIDATION_ERROR",
	"INTERNAL_ERROR",
]);

export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export interface ApiError {
	code: ApiErrorCode;
	message: string;
	details?: unknown;
}

// =============================================================================
// Response Envelope
// =============================================================================

export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: ApiError;
}

// =============================================================================
// Module Types
// =============================================================================

export interface ModuleListItem {
	name: string;
	category: ModuleCategory;
	description?: string;
	href?: string;
	status: ModuleStatus;
	dependsOn?: string[];
}

export interface ModuleDetail extends ModuleListItem {
	hasInstallTasks: boolean;
	hasRemoveTasks: boolean;
	hasStartTasks: boolean;
	hasStopTasks: boolean;
}

export interface ModuleListResponse {
	modules: ModuleListItem[];
	locked: boolean;
	lockMessage?: string;
}

// =============================================================================
// Operation Types
// =============================================================================

export const OperationStatus = z.enum(["queued", "running", "completed", "failed"]);

export type OperationStatus = z.infer<typeof OperationStatus>;

export interface OperationResponse {
	operationId: string;
	module: string;
	operation: Operation;
	status: OperationStatus;
	startedAt: string;
	completedAt?: string;
	error?: string;
}

// =============================================================================
// Lock Types
// =============================================================================

export interface LockStatusResponse {
	locked: boolean;
	modules: string[];
	lockedAt?: string;
	lockedBy?: string;
	message?: string;
}

// =============================================================================
// Config Types
// =============================================================================

export interface ConfigResponse {
	domainBase: string;
	serverPort: number;
	serverHost: string;
}

// =============================================================================
// Health Types
// =============================================================================

export interface HealthResponse {
	status: "ok";
	version: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a success response
 */
export function successResponse<T>(data: T): ApiResponse<T> {
	return { success: true, data };
}

/**
 * Create an error response
 */
export function errorResponse(
	code: ApiErrorCode,
	message: string,
	details?: unknown,
): ApiResponse<never> {
	return {
		success: false,
		error: { code, message, details },
	};
}

/**
 * Create a JSON Response with appropriate status code
 */
export function jsonResponse<T>(data: ApiResponse<T>, status = 200): Response {
	return Response.json(data, { status });
}

/**
 * Map error code to HTTP status
 */
export function errorCodeToStatus(code: ApiErrorCode): number {
	switch (code) {
		case "NOT_FOUND":
			return 404;
		case "LOCKED":
			return 403;
		case "OPERATION_IN_PROGRESS":
			return 409;
		case "VALIDATION_ERROR":
			return 400;
		case "INTERNAL_ERROR":
			return 500;
		default:
			return 500;
	}
}
