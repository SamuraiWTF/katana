import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TaskExecutor, executeTasks, allSucceeded, getFailures, getChanges } from "../../../src/core/executor";
import { MockState, getMockState } from "../../../src/core/mock-state";
import { PluginRegistry, getPluginRegistry } from "../../../src/plugins/registry";
import type { Task } from "../../../src/types/module";

describe("TaskExecutor", () => {
	beforeEach(async () => {
		MockState.resetInstance();
		PluginRegistry.resetInstance();
		// Load plugins for testing
		await getPluginRegistry().loadBuiltinPlugins();
	});

	afterEach(() => {
		MockState.resetInstance();
		PluginRegistry.resetInstance();
	});

	describe("execute", () => {
		test("executes docker task", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [
				{ docker: { name: "test", image: "nginx:latest" } },
			];

			const results = await executor.execute(tasks, "install");

			expect(results.length).toBe(1);
			expect(results[0]!.result.success).toBe(true);
			expect(getMockState().containerExists("test")).toBe(true);
		});

		test("executes service task", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [
				{ service: { name: "nginx", state: "running" } },
			];

			const results = await executor.execute(tasks, "install");

			expect(results.length).toBe(1);
			expect(results[0]!.result.success).toBe(true);
			expect(getMockState().serviceRunning("nginx")).toBe(true);
		});

		test("executes lineinfile task", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [
				{ lineinfile: { dest: "/etc/hosts", line: "127.0.0.1 test.local", state: "present" } },
			];

			const results = await executor.execute(tasks, "install");

			expect(results.length).toBe(1);
			expect(results[0]!.result.success).toBe(true);
			expect(getMockState().hasLine("/etc/hosts", "127.0.0.1 test.local")).toBe(true);
		});

		test("executes file task", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [
				{ file: { path: "/opt/myapp", state: "directory" } },
			];

			const results = await executor.execute(tasks, "install");

			expect(results.length).toBe(1);
			expect(results[0]!.result.success).toBe(true);
			expect(getMockState().fileExists("/opt/myapp")).toBe(true);
		});

		test("executes multiple tasks sequentially", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [
				{ service: { name: "docker", state: "running" } },
				{ docker: { name: "app", image: "nginx:latest" } },
				{ lineinfile: { dest: "/etc/hosts", line: "127.0.0.1 app.local", state: "present" } },
			];

			const results = await executor.execute(tasks, "install");

			expect(results.length).toBe(3);
			expect(results.every((r) => r.result.success)).toBe(true);
		});

		test("stops on first failure when stopOnError is true", async () => {
			const executor = new TaskExecutor({ mock: true, stopOnError: true });
			const tasks: Task[] = [
				{ docker: { name: "existing" } }, // Will fail - no image and doesn't exist
				{ service: { name: "nginx", state: "running" } }, // Should not execute
			];

			const results = await executor.execute(tasks, "start");

			expect(results.length).toBe(1);
			expect(results[0]!.result.success).toBe(false);
		});

		test("continues on failure when stopOnError is false", async () => {
			const executor = new TaskExecutor({ mock: true, stopOnError: false });
			const tasks: Task[] = [
				{ docker: { name: "nonexistent" } }, // Will fail - doesn't exist
				{ service: { name: "nginx", state: "running" } },
			];

			const results = await executor.execute(tasks, "start");

			expect(results.length).toBe(2);
			expect(results[0]!.result.success).toBe(false);
			expect(results[1]!.result.success).toBe(true);
		});

		test("tracks task duration", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [
				{ service: { name: "nginx", state: "running" } },
			];

			const results = await executor.execute(tasks, "install");

			expect(results[0]!.duration).toBeGreaterThanOrEqual(0);
		});

		test("handles named tasks", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [
				{ name: "Start nginx service", service: { name: "nginx", state: "running" } },
			];

			const results = await executor.execute(tasks, "install");

			expect(results.length).toBe(1);
			expect(results[0]!.result.success).toBe(true);
		});
	});

	describe("events", () => {
		test("emits execution:start event", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [{ service: { name: "nginx", state: "running" } }];
			let startEvent: [Task[], string] | null = null;

			executor.on("execution:start", (tasks, operation) => {
				startEvent = [tasks, operation];
			});

			await executor.execute(tasks, "install");

			expect(startEvent).not.toBeNull();
			expect(startEvent![1]).toBe("install");
		});

		test("emits task:start event", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [{ service: { name: "nginx", state: "running" } }];
			const startEvents: Array<{ index: number; total: number }> = [];

			executor.on("task:start", (task, index, total) => {
				startEvents.push({ index, total });
			});

			await executor.execute(tasks, "install");

			expect(startEvents.length).toBe(1);
			expect(startEvents[0]).toEqual({ index: 0, total: 1 });
		});

		test("emits task:complete event", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [{ service: { name: "nginx", state: "running" } }];
			let completeEvent: { success: boolean } | null = null;

			executor.on("task:complete", (task, result, index, total) => {
				completeEvent = { success: result.success };
			});

			await executor.execute(tasks, "install");

			expect(completeEvent).not.toBeNull();
			expect(completeEvent!.success).toBe(true);
		});

		test("emits execution:complete event", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [{ service: { name: "nginx", state: "running" } }];
			let resultsCount = 0;

			executor.on("execution:complete", (results) => {
				resultsCount = results.length;
			});

			await executor.execute(tasks, "install");

			expect(resultsCount).toBe(1);
		});

		test("emits log events through default logger", async () => {
			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [{ service: { name: "nginx", state: "running" } }];
			const logMessages: string[] = [];

			executor.on("log", (level, message) => {
				logMessages.push(`${level}: ${message}`);
			});

			await executor.execute(tasks, "install");

			expect(logMessages.length).toBeGreaterThan(0);
		});
	});

	describe("operation context", () => {
		test("passes install operation to plugins", async () => {
			const executor = new TaskExecutor({ mock: true });
			// Create container with image (install creates it)
			const tasks: Task[] = [
				{ docker: { name: "test", image: "nginx:latest" } },
			];

			await executor.execute(tasks, "install");

			expect(getMockState().containerExists("test")).toBe(true);
		});

		test("passes remove operation to plugins", async () => {
			// First create a container
			getMockState().createContainer("test", "nginx", {});

			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [{ docker: { name: "test" } }];

			await executor.execute(tasks, "remove");

			expect(getMockState().containerExists("test")).toBe(false);
		});

		test("passes start operation to plugins", async () => {
			// First create a stopped container
			getMockState().createContainer("test", "nginx", {});

			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [{ docker: { name: "test" } }];

			await executor.execute(tasks, "start");

			expect(getMockState().containerRunning("test")).toBe(true);
		});

		test("passes stop operation to plugins", async () => {
			// First create a running container
			const mock = getMockState();
			mock.createContainer("test", "nginx", {});
			mock.startContainer("test");

			const executor = new TaskExecutor({ mock: true });
			const tasks: Task[] = [{ docker: { name: "test" } }];

			await executor.execute(tasks, "stop");

			expect(mock.containerRunning("test")).toBe(false);
		});
	});

	describe("helper functions", () => {
		test("executeTasks convenience function", async () => {
			const tasks: Task[] = [{ service: { name: "nginx", state: "running" } }];
			const results = await executeTasks(tasks, "install", { mock: true });

			expect(results.length).toBe(1);
			expect(results[0]!.result.success).toBe(true);
		});

		test("allSucceeded returns true when all succeed", async () => {
			const tasks: Task[] = [{ service: { name: "nginx", state: "running" } }];
			const results = await executeTasks(tasks, "install", { mock: true });

			expect(allSucceeded(results)).toBe(true);
		});

		test("allSucceeded returns false when any fails", async () => {
			const tasks: Task[] = [{ docker: { name: "nonexistent" } }];
			const results = await executeTasks(tasks, "start", { mock: true });

			expect(allSucceeded(results)).toBe(false);
		});

		test("getFailures returns failed tasks", async () => {
			const tasks: Task[] = [
				{ docker: { name: "nonexistent" } },
				{ service: { name: "nginx", state: "running" } },
			];
			const results = await executeTasks(tasks, "start", {
				mock: true,
				stopOnError: false,
			});

			const failures = getFailures(results);
			expect(failures.length).toBe(1);
		});

		test("getChanges returns changed tasks", async () => {
			const tasks: Task[] = [{ service: { name: "nginx", state: "running" } }];
			const results = await executeTasks(tasks, "install", { mock: true });

			const changes = getChanges(results);
			expect(changes.length).toBe(1);
		});
	});
});
