/**
 * Server-Sent Events (SSE) helpers for streaming operation progress
 */

import { z } from "zod";

// =============================================================================
// SSE Event Types
// =============================================================================

/**
 * Progress event - indicates operation progress
 */
export const ProgressEventSchema = z.object({
  type: z.literal("progress"),
  percent: z.number().min(0).max(100),
  message: z.string(),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/**
 * Task event - task status update
 */
export const TaskEventSchema = z.object({
  type: z.literal("task"),
  name: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
});

export type TaskEvent = z.infer<typeof TaskEventSchema>;

/**
 * Log event - log line from operation
 */
export const LogEventSchema = z.object({
  type: z.literal("log"),
  line: z.string(),
  level: z.enum(["info", "error"]),
});

export type LogEvent = z.infer<typeof LogEventSchema>;

/**
 * Complete event - operation finished
 */
export const CompleteEventSchema = z.object({
  type: z.literal("complete"),
  success: z.boolean(),
  error: z.string().optional(),
  duration: z.number().nonnegative(), // milliseconds
});

export type CompleteEvent = z.infer<typeof CompleteEventSchema>;

/**
 * Union of all SSE event types
 */
export const SSEEventSchema = z.discriminatedUnion("type", [
  ProgressEventSchema,
  TaskEventSchema,
  LogEventSchema,
  CompleteEventSchema,
]);

export type SSEEvent = z.infer<typeof SSEEventSchema>;

// =============================================================================
// SSE Formatting
// =============================================================================

/**
 * Format an event as an SSE message string
 */
export function formatSSEMessage(event: SSEEvent): string {
  const data = JSON.stringify(event);
  return `event: ${event.type}\ndata: ${data}\n\n`;
}

/**
 * Create a heartbeat message (keeps connection alive)
 */
export function createHeartbeat(): string {
  return ": heartbeat\n\n";
}

// =============================================================================
// SSE Stream Creation
// =============================================================================

const encoder = new TextEncoder();

/**
 * Create an SSE ReadableStream with automatic heartbeat
 *
 * @param onStart - Called when stream starts, receives controller for enqueuing events
 * @param heartbeatInterval - Milliseconds between heartbeats (default: 15000)
 */
export function createSSEStream(
  onStart: (controller: ReadableStreamDefaultController<Uint8Array>) => void | Promise<void>,
  heartbeatInterval = 15000,
): ReadableStream<Uint8Array> {
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Start heartbeat timer
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(createHeartbeat()));
        } catch {
          // Controller closed, will be cleaned up in cancel
        }
      }, heartbeatInterval);

      // Call user's start handler
      await onStart(controller);
    },

    cancel() {
      // Clean up heartbeat timer
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    },
  });
}

/**
 * Send an SSE event to a controller
 */
export function sendSSEEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: SSEEvent,
): boolean {
  try {
    const message = formatSSEMessage(event);
    controller.enqueue(encoder.encode(message));
    return true;
  } catch {
    // Controller is closed
    return false;
  }
}

/**
 * Close an SSE stream gracefully
 */
export function closeSSEStream(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.close();
  } catch {
    // Already closed
  }
}

/**
 * Create SSE Response headers
 */
export function createSSEHeaders(): Headers {
  return new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  });
}
