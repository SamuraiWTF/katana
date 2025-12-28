import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getMockState, MockState } from "../../../src/core/mock-state";
import { DockerPlugin } from "../../../src/plugins/docker";
import type { ExecutionContext, Logger } from "../../../src/types/plugin";

describe("DockerPlugin", () => {
	let plugin: DockerPlugin;
	let logs: string[];
	let mockLogger: Logger;
	let baseContext: Omit<ExecutionContext, "operation">;

	beforeEach(() => {
		MockState.resetInstance();
		plugin = new DockerPlugin();
		logs = [];
		mockLogger = {
			debug: (msg) => logs.push(`debug: ${msg}`),
			info: (msg) => logs.push(`info: ${msg}`),
			warn: (msg) => logs.push(`warn: ${msg}`),
			error: (msg) => logs.push(`error: ${msg}`),
		};
		baseContext = {
			mock: true,
			dryRun: false,
			logger: mockLogger,
		};
	});

	afterEach(() => {
		MockState.resetInstance();
	});

	describe("execute (mock mode)", () => {
		describe("install operation", () => {
			test("creates and starts container with image", async () => {
				const result = await plugin.execute(
					{ name: "test", image: "nginx:latest", ports: { "80/tcp": 8080 } },
					{ ...baseContext, operation: "install" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(true);
				expect(getMockState().containerExists("test")).toBe(true);
				expect(getMockState().containerRunning("test")).toBe(true);
			});

			test("is idempotent - noop if container already running", async () => {
				const mock = getMockState();
				mock.createContainer("test", "nginx:latest", {});
				mock.startContainer("test");

				const result = await plugin.execute(
					{ name: "test", image: "nginx:latest" },
					{ ...baseContext, operation: "install" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(false);
			});

			test("starts existing stopped container", async () => {
				const mock = getMockState();
				mock.createContainer("test", "nginx:latest", {});

				const result = await plugin.execute(
					{ name: "test", image: "nginx:latest" },
					{ ...baseContext, operation: "install" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(true);
				expect(mock.containerRunning("test")).toBe(true);
			});
		});

		describe("start operation", () => {
			test("starts existing container", async () => {
				const mock = getMockState();
				mock.createContainer("test", "nginx:latest", {});

				const result = await plugin.execute(
					{ name: "test" },
					{ ...baseContext, operation: "start" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(true);
				expect(mock.containerRunning("test")).toBe(true);
			});

			test("fails if container does not exist", async () => {
				const result = await plugin.execute(
					{ name: "nonexistent" },
					{ ...baseContext, operation: "start" },
				);

				expect(result.success).toBe(false);
				expect(result.message).toContain("does not exist");
			});

			test("is idempotent - noop if already running", async () => {
				const mock = getMockState();
				mock.createContainer("test", "nginx:latest", {});
				mock.startContainer("test");

				const result = await plugin.execute(
					{ name: "test" },
					{ ...baseContext, operation: "start" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(false);
			});
		});

		describe("stop operation", () => {
			test("stops running container", async () => {
				const mock = getMockState();
				mock.createContainer("test", "nginx:latest", {});
				mock.startContainer("test");

				const result = await plugin.execute(
					{ name: "test" },
					{ ...baseContext, operation: "stop" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(true);
				expect(mock.containerRunning("test")).toBe(false);
			});

			test("is idempotent - noop if not running", async () => {
				const mock = getMockState();
				mock.createContainer("test", "nginx:latest", {});

				const result = await plugin.execute(
					{ name: "test" },
					{ ...baseContext, operation: "stop" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(false);
			});

			test("is idempotent - noop if does not exist", async () => {
				const result = await plugin.execute(
					{ name: "nonexistent" },
					{ ...baseContext, operation: "stop" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(false);
			});
		});

		describe("remove operation", () => {
			test("removes existing container", async () => {
				const mock = getMockState();
				mock.createContainer("test", "nginx:latest", {});

				const result = await plugin.execute(
					{ name: "test" },
					{ ...baseContext, operation: "remove" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(true);
				expect(mock.containerExists("test")).toBe(false);
			});

			test("stops and removes running container", async () => {
				const mock = getMockState();
				mock.createContainer("test", "nginx:latest", {});
				mock.startContainer("test");

				const result = await plugin.execute(
					{ name: "test" },
					{ ...baseContext, operation: "remove" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(true);
				expect(mock.containerExists("test")).toBe(false);
			});

			test("is idempotent - noop if does not exist", async () => {
				const result = await plugin.execute(
					{ name: "nonexistent" },
					{ ...baseContext, operation: "remove" },
				);

				expect(result.success).toBe(true);
				expect(result.changed).toBe(false);
			});
		});
	});

	describe("validation", () => {
		test("fails with invalid params", async () => {
			const result = await plugin.execute(
				{ invalid: "params" },
				{ ...baseContext, operation: "install" },
			);

			expect(result.success).toBe(false);
			expect(result.message).toContain("Invalid docker params");
		});

		test("fails with missing name", async () => {
			const result = await plugin.execute(
				{ image: "nginx" },
				{ ...baseContext, operation: "install" },
			);

			expect(result.success).toBe(false);
		});
	});

	describe("dry run mode", () => {
		test("logs action without executing", async () => {
			// Use mock: false so dry run takes precedence
			const result = await plugin.execute(
				{ name: "test", image: "nginx:latest" },
				{ mock: false, dryRun: true, logger: mockLogger, operation: "install" },
			);

			expect(result.success).toBe(true);
			expect(result.changed).toBe(false);
			expect(logs.some((l) => l.includes("dry-run"))).toBe(true);
		});
	});

	describe("exists", () => {
		test("returns true if container exists (mock mode)", async () => {
			const originalEnv = process.env.KATANA_MOCK;
			process.env.KATANA_MOCK = "true";
			try {
				getMockState().createContainer("test", "nginx", {});
				const exists = await plugin.exists({ name: "test" });
				expect(exists).toBe(true);
			} finally {
				process.env.KATANA_MOCK = originalEnv;
			}
		});

		test("returns false if container does not exist (mock mode)", async () => {
			const originalEnv = process.env.KATANA_MOCK;
			process.env.KATANA_MOCK = "true";
			try {
				const exists = await plugin.exists({ name: "nonexistent" });
				expect(exists).toBe(false);
			} finally {
				process.env.KATANA_MOCK = originalEnv;
			}
		});
	});

	describe("started", () => {
		test("returns true if container is running (mock mode)", async () => {
			const originalEnv = process.env.KATANA_MOCK;
			process.env.KATANA_MOCK = "true";
			try {
				const mock = getMockState();
				mock.createContainer("test", "nginx", {});
				mock.startContainer("test");
				const started = await plugin.started({ name: "test" });
				expect(started).toBe(true);
			} finally {
				process.env.KATANA_MOCK = originalEnv;
			}
		});

		test("returns false if container is stopped (mock mode)", async () => {
			const originalEnv = process.env.KATANA_MOCK;
			process.env.KATANA_MOCK = "true";
			try {
				getMockState().createContainer("test", "nginx", {});
				const started = await plugin.started({ name: "test" });
				expect(started).toBe(false);
			} finally {
				process.env.KATANA_MOCK = originalEnv;
			}
		});
	});
});
