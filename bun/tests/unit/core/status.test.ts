import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getMockState, MockState } from "../../../src/core/mock-state";
import type { LoadedModule } from "../../../src/core/module-loader";
import { StatusChecker } from "../../../src/core/status";
import { PluginRegistry } from "../../../src/plugins/registry";
import { ModuleStatus } from "../../../src/types/status";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock module for testing
 */
function createMockModule(overrides: Partial<LoadedModule> = {}): LoadedModule {
	return {
		name: "test-module",
		category: "targets",
		sourcePath: "/mock/test-module.yml",
		sourceDir: "/mock",
		...overrides,
	};
}

// =============================================================================
// Tests
// =============================================================================

describe("StatusChecker", () => {
	beforeEach(async () => {
		// Enable mock mode
		process.env.KATANA_MOCK = "true";

		// Reset singletons
		MockState.resetInstance();
		PluginRegistry.resetInstance();
	});

	afterEach(() => {
		delete process.env.KATANA_MOCK;
		MockState.resetInstance();
		PluginRegistry.resetInstance();
	});

	describe("checkStatus", () => {
		test("returns NOT_INSTALLED when docker container does not exist", async () => {
			const module = createMockModule({
				status: {
					installed: { exists: { docker: "mycontainer" } },
					running: { started: { docker: "mycontainer" } },
				},
			});

			const checker = new StatusChecker();
			const result = await checker.checkStatus(module);

			expect(result.status).toBe(ModuleStatus.NOT_INSTALLED);
			expect(result.installed).toBe(false);
			expect(result.running).toBe(false);
		});

		test("returns STOPPED when container exists but not running", async () => {
			// Create container but don't start it
			const mock = getMockState();
			mock.createContainer("mycontainer", "myimage", {});

			const module = createMockModule({
				status: {
					installed: { exists: { docker: "mycontainer" } },
					running: { started: { docker: "mycontainer" } },
				},
			});

			const checker = new StatusChecker();
			const result = await checker.checkStatus(module);

			expect(result.status).toBe(ModuleStatus.STOPPED);
			expect(result.installed).toBe(true);
			expect(result.running).toBe(false);
		});

		test("returns RUNNING when container exists and is running", async () => {
			const mock = getMockState();
			mock.createContainer("mycontainer", "myimage", {});
			mock.startContainer("mycontainer");

			const module = createMockModule({
				status: {
					installed: { exists: { docker: "mycontainer" } },
					running: { started: { docker: "mycontainer" } },
				},
			});

			const checker = new StatusChecker();
			const result = await checker.checkStatus(module);

			expect(result.status).toBe(ModuleStatus.RUNNING);
			expect(result.installed).toBe(true);
			expect(result.running).toBe(true);
		});

		test("returns INSTALLED when no running check is defined", async () => {
			const mock = getMockState();
			mock.createContainer("mycontainer", "myimage", {});

			const module = createMockModule({
				status: {
					installed: { exists: { docker: "mycontainer" } },
					// No running check defined
				},
			});

			const checker = new StatusChecker();
			const result = await checker.checkStatus(module);

			expect(result.status).toBe(ModuleStatus.INSTALLED);
			expect(result.installed).toBe(true);
			expect(result.running).toBe(false);
		});

		test("returns NOT_INSTALLED when module has no status checks", async () => {
			const module = createMockModule({
				// No status section
			});

			const checker = new StatusChecker();
			const result = await checker.checkStatus(module);

			expect(result.status).toBe(ModuleStatus.NOT_INSTALLED);
			expect(result.installed).toBe(false);
			expect(result.running).toBe(false);
		});

		test("checks service status correctly", async () => {
			const mock = getMockState();
			mock.startService("nginx");

			const module = createMockModule({
				status: {
					installed: { exists: { service: "nginx" } },
					running: { started: { service: "nginx" } },
				},
			});

			const checker = new StatusChecker();
			const result = await checker.checkStatus(module);

			expect(result.status).toBe(ModuleStatus.RUNNING);
			expect(result.installed).toBe(true);
			expect(result.running).toBe(true);
		});

		test("checks path/file status correctly", async () => {
			const mock = getMockState();
			mock.createDirectory("/opt/myapp");

			const module = createMockModule({
				status: {
					installed: { exists: { path: "/opt/myapp" } },
				},
			});

			const checker = new StatusChecker();
			const result = await checker.checkStatus(module);

			expect(result.status).toBe(ModuleStatus.INSTALLED);
			expect(result.installed).toBe(true);
		});

		test("caches results within TTL", async () => {
			const mock = getMockState();
			mock.createContainer("mycontainer", "myimage", {});

			const module = createMockModule({
				status: {
					installed: { exists: { docker: "mycontainer" } },
				},
			});

			const checker = new StatusChecker({ cacheTTL: 10000 });

			// First check
			const result1 = await checker.checkStatus(module);
			expect(result1.installed).toBe(true);

			// Remove the container
			mock.removeContainer("mycontainer");

			// Second check should return cached result
			const result2 = await checker.checkStatus(module);
			expect(result2.installed).toBe(true); // Still cached as installed
			expect(result2.checkedAt).toBe(result1.checkedAt); // Same timestamp
		});

		test("clears cache on clearCache()", async () => {
			const mock = getMockState();
			mock.createContainer("mycontainer", "myimage", {});

			const module = createMockModule({
				status: {
					installed: { exists: { docker: "mycontainer" } },
				},
			});

			const checker = new StatusChecker({ cacheTTL: 10000 });

			// First check
			await checker.checkStatus(module);

			// Remove container
			mock.removeContainer("mycontainer");

			// Clear cache
			checker.clearCache();

			// Should re-check and find container gone
			const result = await checker.checkStatus(module);
			expect(result.installed).toBe(false);
		});
	});

	describe("checkStatusBatch", () => {
		test("checks multiple modules in parallel", async () => {
			const mock = getMockState();
			mock.createContainer("container1", "image1", {});
			mock.startContainer("container1");
			// container2 doesn't exist

			const module1 = createMockModule({
				name: "module1",
				status: {
					installed: { exists: { docker: "container1" } },
					running: { started: { docker: "container1" } },
				},
			});

			const module2 = createMockModule({
				name: "module2",
				status: {
					installed: { exists: { docker: "container2" } },
				},
			});

			const checker = new StatusChecker();
			const results = await checker.checkStatusBatch([module1, module2]);

			expect(results.size).toBe(2);

			const status1 = results.get("module1");
			expect(status1?.status).toBe(ModuleStatus.RUNNING);
			expect(status1?.installed).toBe(true);
			expect(status1?.running).toBe(true);

			const status2 = results.get("module2");
			expect(status2?.status).toBe(ModuleStatus.NOT_INSTALLED);
			expect(status2?.installed).toBe(false);
		});

		test("handles empty module list", async () => {
			const checker = new StatusChecker();
			const results = await checker.checkStatusBatch([]);

			expect(results.size).toBe(0);
		});
	});

	describe("formatStatus", () => {
		test("formats 'not installed' status", () => {
			const result = StatusChecker.formatStatus({
				status: ModuleStatus.NOT_INSTALLED,
				installed: false,
				running: false,
				checkedAt: Date.now(),
			});

			expect(result).toBe("not installed");
		});

		test("formats 'installed, running' status", () => {
			const result = StatusChecker.formatStatus({
				status: ModuleStatus.RUNNING,
				installed: true,
				running: true,
				checkedAt: Date.now(),
			});

			expect(result).toBe("installed, running");
		});

		test("formats 'installed, stopped' status", () => {
			const result = StatusChecker.formatStatus({
				status: ModuleStatus.STOPPED,
				installed: true,
				running: false,
				checkedAt: Date.now(),
			});

			expect(result).toBe("installed, stopped");
		});

		test("formats 'installed' status (no running check)", () => {
			const result = StatusChecker.formatStatus({
				status: ModuleStatus.INSTALLED,
				installed: true,
				running: false,
				checkedAt: Date.now(),
			});

			expect(result).toBe("installed");
		});
	});
});
