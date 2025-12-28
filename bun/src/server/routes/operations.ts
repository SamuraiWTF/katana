/**
 * Operation REST API endpoints
 */

import { OperationManager } from "../operations";
import { createSSEStream, sendSSEEvent } from "../sse";
import { errorResponse, jsonResponse, type OperationResponse, successResponse } from "../types";

// =============================================================================
// Get Operation Status
// =============================================================================

/**
 * GET /api/operations/:id - Get operation status
 */
export async function getOperation(operationId: string): Promise<Response> {
	const operationManager = OperationManager.getInstance();
	const operation = operationManager.getOperation(operationId);

	if (!operation) {
		return jsonResponse(errorResponse("NOT_FOUND", `Operation not found: ${operationId}`), 404);
	}

	const response: OperationResponse = {
		operationId: operation.id,
		module: operation.module,
		operation: operation.operation,
		status: operation.status,
		startedAt: operation.startedAt.toISOString(),
		completedAt: operation.completedAt?.toISOString(),
		error: operation.error,
	};

	return jsonResponse(successResponse(response));
}

// =============================================================================
// SSE Stream
// =============================================================================

/**
 * GET /api/operations/:id/stream - Stream operation progress via SSE
 */
export async function streamOperation(operationId: string): Promise<Response> {
	const operationManager = OperationManager.getInstance();
	const operation = operationManager.getOperation(operationId);

	if (!operation) {
		return jsonResponse(errorResponse("NOT_FOUND", `Operation not found: ${operationId}`), 404);
	}

	// If operation already completed, send completion event and close
	if (operation.status === "completed" || operation.status === "failed") {
		return createSSEStream(
			(controller) => {
				sendSSEEvent(controller, {
					type: "complete",
					module: operation.module,
					operation: operation.operation,
					success: operation.status === "completed",
					duration: operation.completedAt
						? operation.completedAt.getTime() - operation.startedAt.getTime()
						: undefined,
				});
				controller.close();
			},
			() => {
				// Nothing to cleanup
			},
		);
	}

	// Subscribe to operation events
	return createSSEStream(
		(controller) => {
			// Subscribe to future events
			operationManager.subscribe(operationId, controller);

			// Send initial status event
			sendSSEEvent(controller, {
				type: "status",
				module: operation.module,
				status: operation.status === "running" ? "running" : "not_installed",
			});
		},
		(controller) => {
			// Unsubscribe on disconnect
			operationManager.unsubscribe(operationId, controller);
		},
	);
}
