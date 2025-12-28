/**
 * Server-Sent Events (SSE) helpers
 */

import { formatSSEMessage, type SSEEvent } from "../types/events";

// =============================================================================
// Constants
// =============================================================================

export const SSE_HEADERS = {
	"Content-Type": "text/event-stream",
	"Cache-Control": "no-cache",
	Connection: "keep-alive",
	"X-Accel-Buffering": "no", // Disable nginx buffering
} as const;

const DEFAULT_HEARTBEAT_INTERVAL = 30000; // 30 seconds

// =============================================================================
// SSE Stream Creation
// =============================================================================

export interface SSEStreamOptions {
	heartbeatInterval?: number;
}

/**
 * Create an SSE Response with a ReadableStream
 */
export function createSSEStream(
	onStart: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
	onClose: (controller: ReadableStreamDefaultController<Uint8Array>) => void,
	options: SSEStreamOptions = {},
): Response {
	const heartbeatInterval = options.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
	const encoder = new TextEncoder();
	let heartbeatTimer: Timer | null = null;
	let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controllerRef = controller;

			// Start heartbeat
			heartbeatTimer = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(": heartbeat\n\n"));
				} catch {
					// Stream closed
					if (heartbeatTimer) {
						clearInterval(heartbeatTimer);
						heartbeatTimer = null;
					}
				}
			}, heartbeatInterval);

			// Call user's onStart
			onStart(controller);
		},
		cancel() {
			if (heartbeatTimer) {
				clearInterval(heartbeatTimer);
				heartbeatTimer = null;
			}
			if (controllerRef) {
				onClose(controllerRef);
			}
		},
	});

	return new Response(stream, { headers: SSE_HEADERS });
}

// =============================================================================
// SSE Event Helpers
// =============================================================================

/**
 * Send an SSE event to a controller
 */
export function sendSSEEvent(
	controller: ReadableStreamDefaultController<Uint8Array>,
	event: SSEEvent,
): boolean {
	const encoder = new TextEncoder();
	const message = formatSSEMessage(event);

	try {
		controller.enqueue(encoder.encode(message));
		return true;
	} catch {
		// Stream closed
		return false;
	}
}

/**
 * Send a raw message to a controller
 */
export function sendSSEMessage(
	controller: ReadableStreamDefaultController<Uint8Array>,
	message: string,
): boolean {
	const encoder = new TextEncoder();

	try {
		controller.enqueue(encoder.encode(message));
		return true;
	} catch {
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
