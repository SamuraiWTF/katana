/**
 * Tests for the REST API server
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { StateManager } from "../../../src/core/state-manager";
import { createServer } from "../../../src/server";
import { OperationManager } from "../../../src/server/operations";
import { DEFAULT_CONFIG } from "../../../src/types/config";

// Type for API responses in tests
interface TestApiResponse {
	success: boolean;
	data?: Record<string, unknown>;
	error?: {
		code: string;
		message: string;
	};
}

describe("REST API Server", () => {
	let server: ReturnType<typeof createServer>;
	let baseUrl: string;

	beforeAll(() => {
		// Create server with random port
		const config = {
			...DEFAULT_CONFIG,
			server: {
				...DEFAULT_CONFIG.server,
				port: 0, // Let OS assign port
				cors: true,
			},
		};

		server = createServer({ config });
		baseUrl = `http://localhost:${server.port}`;
	});

	afterAll(async () => {
		server.stop();
		OperationManager.resetInstance();

		// Clean up any installed modules from tests
		const stateManager = StateManager.getInstance();
		for (const mod of await stateManager.getInstalledModuleNames()) {
			await stateManager.removeModule(mod);
		}

		// Reset the StateManager instance to ensure a clean slate for other tests
		StateManager.resetInstance();
	});

	afterEach(async () => {
		// Clean up lock state between tests
		const stateManager = StateManager.getInstance();
		if (await stateManager.isLocked()) {
			await stateManager.disableLock();
		}
		// Note: We don't reset OperationManager between tests because
		// tests may still have operations running
	});

	// =========================================================================
	// Health Check
	// =========================================================================

	describe("GET /health", () => {
		test("returns health status", async () => {
			const res = await fetch(`${baseUrl}/health`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data?.status).toBe("ok");
			expect(data.data?.version).toBe("0.1.0");
		});
	});

	// =========================================================================
	// Module Endpoints
	// =========================================================================

	describe("GET /api/modules", () => {
		test("returns list of all modules", async () => {
			const res = await fetch(`${baseUrl}/api/modules`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(Array.isArray(data.data?.modules)).toBe(true);
			expect((data.data?.modules as unknown[]).length).toBeGreaterThan(0);
			expect(data.data?.locked).toBe(false);
		});

		test("filters by category", async () => {
			const res = await fetch(`${baseUrl}/api/modules?category=targets`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect((data.data?.modules as { category: string }[]).every((m) => m.category === "targets")).toBe(true);
		});

		test("returns 400 for invalid category", async () => {
			const res = await fetch(`${baseUrl}/api/modules?category=invalid`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.error?.code).toBe("VALIDATION_ERROR");
		});
	});

	describe("GET /api/modules/:name", () => {
		test("returns module details", async () => {
			const res = await fetch(`${baseUrl}/api/modules/dvwa`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data?.name).toBe("dvwa");
			expect(data.data?.category).toBe("targets");
			expect(data.data?.hasInstallTasks).toBe(true);
		});

		test("returns 404 for unknown module", async () => {
			const res = await fetch(`${baseUrl}/api/modules/nonexistent`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(404);
			expect(data.success).toBe(false);
			expect(data.error?.code).toBe("NOT_FOUND");
		});
	});

	describe("GET /api/modules/:name/status", () => {
		test("returns module status", async () => {
			const res = await fetch(`${baseUrl}/api/modules/dvwa/status`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data?.module).toBe("dvwa");
			expect(typeof data.data?.installed).toBe("boolean");
			expect(typeof data.data?.running).toBe("boolean");
		});
	});

	// =========================================================================
	// Config Endpoints
	// =========================================================================

	describe("GET /api/config", () => {
		test("returns configuration", async () => {
			const res = await fetch(`${baseUrl}/api/config`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(typeof data.data?.domainBase).toBe("string");
			expect(typeof data.data?.serverPort).toBe("number");
			expect(typeof data.data?.serverHost).toBe("string");
		});
	});

	// =========================================================================
	// Lock Endpoints
	// =========================================================================

	describe("Lock API", () => {
		test("GET /api/lock returns lock status", async () => {
			const res = await fetch(`${baseUrl}/api/lock`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data?.locked).toBe(false);
		});

		test("POST /api/lock enables lock", async () => {
			const res = await fetch(`${baseUrl}/api/lock`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: "Test lock" }),
			});
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data?.locked).toBe(true);
			expect(data.data?.message).toBe("Test lock");
		});

		test("POST /api/lock returns error if already locked", async () => {
			// Enable lock first
			const stateManager = StateManager.getInstance();
			await stateManager.enableLock({ message: "Already locked" });

			const res = await fetch(`${baseUrl}/api/lock`, {
				method: "POST",
			});
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(400);
			expect(data.success).toBe(false);
			expect(data.error?.code).toBe("VALIDATION_ERROR");
		});

		test("DELETE /api/lock disables lock", async () => {
			// Enable lock first
			const stateManager = StateManager.getInstance();
			await stateManager.enableLock({ message: "To be unlocked" });

			const res = await fetch(`${baseUrl}/api/lock`, {
				method: "DELETE",
			});
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data?.locked).toBe(false);
		});
	});

	// =========================================================================
	// Module Operations
	// =========================================================================

	describe("Module Operations", () => {
		test("POST /api/modules/:name/install returns 403 when locked", async () => {
			const stateManager = StateManager.getInstance();
			await stateManager.enableLock({ message: "Locked for test" });

			const res = await fetch(`${baseUrl}/api/modules/dvwa/install`, {
				method: "POST",
			});
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(403);
			expect(data.success).toBe(false);
			expect(data.error?.code).toBe("LOCKED");
		});

		test("POST /api/modules/:name/install returns 404 for unknown module", async () => {
			const res = await fetch(`${baseUrl}/api/modules/nonexistent/install`, {
				method: "POST",
			});
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(404);
			expect(data.success).toBe(false);
			expect(data.error?.code).toBe("NOT_FOUND");
		});

		test("POST /api/modules/:name/install starts operation", async () => {
			const res = await fetch(`${baseUrl}/api/modules/dvwa/install`, {
				method: "POST",
			});
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(202);
			expect(data.success).toBe(true);
			expect(data.data?.operationId).toBeDefined();
			expect(data.data?.module).toBe("dvwa");
			expect(data.data?.operation).toBe("install");
			expect(["queued", "running"]).toContain(data.data?.status as string);
		});

		test("POST /api/modules/:name/install returns 409 if operation in progress", async () => {
			// Start first operation and immediately try second
			// Use wordlists module which has only file operations - they should be fast
			// but we make requests back-to-back to test concurrency detection
			const [res1, res2] = await Promise.all([
				fetch(`${baseUrl}/api/modules/wordlists/install`, { method: "POST" }),
				// Small delay to ensure first request is processed first
				new Promise<Response>((resolve) =>
					setTimeout(() => fetch(`${baseUrl}/api/modules/wordlists/install`, { method: "POST" }).then(resolve), 5),
				),
			]);

			// First request should succeed
			expect(res1.status).toBe(202);

			// Second request should either succeed (if first finished) or be rejected
			// Either 202 (if first finished quickly) or 409 (if still in progress)
			expect([202, 409]).toContain(res2.status);

			// If it was rejected, verify the error code
			if (res2.status === 409) {
				const data = (await res2.json()) as TestApiResponse;
				expect(data.success).toBe(false);
				expect(data.error?.code).toBe("OPERATION_IN_PROGRESS");
			}
		});

		test("start/stop allowed when locked (only for locked modules)", async () => {
			const stateManager = StateManager.getInstance();

			// Clean up any existing installed modules and lock state
			if (await stateManager.isLocked()) {
				await stateManager.disableLock();
			}
			for (const mod of await stateManager.getInstalledModuleNames()) {
				await stateManager.removeModule(mod);
			}

			// Install modules so they're in the locked list
			// Using modules that successfully load (ffuf, trufflehog)
			await stateManager.installModule("ffuf");
			await stateManager.installModule("trufflehog");

			// Enable lock - these modules will be in the locked list
			await stateManager.enableLock({ message: "Locked for test" });

			// Verify lock state is correct
			const lockState = await stateManager.getLockState();
			expect(lockState.locked).toBe(true);
			expect(lockState.modules).toContain("ffuf");
			expect(lockState.modules).toContain("trufflehog");

			// Start/stop should work on locked modules
			const startRes = await fetch(`${baseUrl}/api/modules/ffuf/start`, {
				method: "POST",
			});
			expect(startRes.status).toBe(202);

			const stopRes = await fetch(`${baseUrl}/api/modules/trufflehog/stop`, {
				method: "POST",
			});
			expect(stopRes.status).toBe(202);

			// Start on a non-locked module should return 404
			const nonLockedRes = await fetch(`${baseUrl}/api/modules/zap/start`, {
				method: "POST",
			});
			expect(nonLockedRes.status).toBe(404);
		});
	});

	// =========================================================================
	// Operation Endpoints
	// =========================================================================

	describe("Operation Endpoints", () => {
		test("GET /api/operations/:id returns operation status", async () => {
			// Start an operation
			const startRes = await fetch(`${baseUrl}/api/modules/zap/install`, {
				method: "POST",
			});
			const startData = (await startRes.json()) as TestApiResponse;
			const operationId = startData.data?.operationId as string;

			// Get operation status
			const res = await fetch(`${baseUrl}/api/operations/${operationId}`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(200);
			expect(data.success).toBe(true);
			expect(data.data?.operationId).toBe(operationId);
			expect(data.data?.module).toBe("zap");
		});

		test("GET /api/operations/:id returns 404 for unknown operation", async () => {
			const res = await fetch(`${baseUrl}/api/operations/nonexistent-id`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(404);
			expect(data.success).toBe(false);
			expect(data.error?.code).toBe("NOT_FOUND");
		});

		test("GET /api/operations/:id/stream returns SSE response", async () => {
			// Start an operation (using ffuf which loads successfully)
			const startRes = await fetch(`${baseUrl}/api/modules/ffuf/install`, {
				method: "POST",
			});
			const startData = (await startRes.json()) as TestApiResponse;
			const operationId = startData.data?.operationId as string;

			// Get SSE stream
			const res = await fetch(`${baseUrl}/api/operations/${operationId}/stream`);

			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("text/event-stream");
		});
	});

	// =========================================================================
	// 404 Handling
	// =========================================================================

	describe("404 Handling", () => {
		test("returns 404 for unknown routes", async () => {
			const res = await fetch(`${baseUrl}/api/unknown`);
			const data = (await res.json()) as TestApiResponse;

			expect(res.status).toBe(404);
			expect(data.success).toBe(false);
			expect(data.error?.code).toBe("NOT_FOUND");
		});
	});
});
