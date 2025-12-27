import { z } from "zod";
import { ModuleStatus } from "./status";

/**
 * SSE event types for streaming operation progress
 */
export const SSEEventType = z.enum(["progress", "log", "status", "complete", "error"]);

export type SSEEventType = z.infer<typeof SSEEventType>;

/**
 * Progress event - indicates task completion progress
 */
export const ProgressEventSchema = z.object({
	type: z.literal("progress"),
	task: z.string(),
	current: z.number().int().nonnegative(),
	total: z.number().int().positive(),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/**
 * Log event - a log message from the operation
 */
export const LogEventSchema = z.object({
	type: z.literal("log"),
	level: z.enum(["debug", "info", "warn", "error"]),
	message: z.string(),
	timestamp: z.string().datetime().optional(),
});

export type LogEvent = z.infer<typeof LogEventSchema>;

/**
 * Status event - module status has changed
 */
export const StatusEventSchema = z.object({
	type: z.literal("status"),
	module: z.string(),
	status: z.enum([
		ModuleStatus.NOT_INSTALLED,
		ModuleStatus.INSTALLED,
		ModuleStatus.STOPPED,
		ModuleStatus.RUNNING,
		ModuleStatus.BLOCKED,
		ModuleStatus.UNKNOWN,
	]),
});

export type StatusEvent = z.infer<typeof StatusEventSchema>;

/**
 * Complete event - operation finished
 */
export const CompleteEventSchema = z.object({
	type: z.literal("complete"),
	module: z.string(),
	operation: z.enum(["install", "remove", "start", "stop"]),
	success: z.boolean(),
	duration: z.number().nonnegative().optional(),
});

export type CompleteEvent = z.infer<typeof CompleteEventSchema>;

/**
 * Error event - operation encountered an error
 */
export const ErrorEventSchema = z.object({
	type: z.literal("error"),
	message: z.string(),
	details: z.string().optional(),
	task: z.string().optional(),
});

export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

/**
 * Union of all SSE event types
 */
export const SSEEventSchema = z.discriminatedUnion("type", [
	ProgressEventSchema,
	LogEventSchema,
	StatusEventSchema,
	CompleteEventSchema,
	ErrorEventSchema,
]);

export type SSEEvent = z.infer<typeof SSEEventSchema>;

/**
 * Create an SSE-formatted message string from an event
 */
export function formatSSEMessage(event: SSEEvent): string {
	const data = JSON.stringify(event);
	return `event: ${event.type}\ndata: ${data}\n\n`;
}
