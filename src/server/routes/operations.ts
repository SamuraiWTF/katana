/**
 * API routes for operation streaming
 */

import { getOperationManager } from "../../core/operation-manager.ts";
import { createSSEHeaders, createSSEStream } from "../sse.ts";

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * GET /api/operations/:id/stream
 * SSE stream for operation progress
 */
export async function handleOperationStream(_req: Request, operationId: string): Promise<Response> {
  const operationManager = getOperationManager();
  const operation = operationManager.getOperation(operationId);

  if (!operation) {
    return Response.json(
      { success: false, error: `Operation not found: ${operationId}` },
      { status: 404 },
    );
  }

  // Create SSE stream
  const stream = createSSEStream((controller) => {
    // Subscribe to operation events
    const subscribed = operationManager.subscribe(operationId, controller);
    if (!subscribed) {
      controller.close();
    }
  });

  return new Response(stream, {
    headers: createSSEHeaders(),
  });
}

/**
 * GET /api/operations/:id
 * Get operation status (non-streaming)
 */
export async function handleGetOperation(_req: Request, operationId: string): Promise<Response> {
  const operationManager = getOperationManager();
  const operation = operationManager.getOperation(operationId);

  if (!operation) {
    return Response.json(
      { success: false, error: `Operation not found: ${operationId}` },
      { status: 404 },
    );
  }

  return Response.json({
    success: true,
    data: {
      id: operation.id,
      module: operation.module,
      operation: operation.operation,
      status: operation.status,
      startedAt: operation.startedAt.toISOString(),
      completedAt: operation.completedAt?.toISOString(),
      error: operation.error,
    },
  });
}
