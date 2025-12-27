import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { getStateManager, StateManager } from "../../../src/core/state-manager";
import { ModuleStatus } from "../../../src/types/status";

// Use crypto.randomUUID for guaranteed uniqueness (important for parallel test runs)
const createTempDir = () => `/tmp/katana-state-test-${crypto.randomUUID()}`;

describe("StateManager", () => {
	let tempDir: string;
	let manager: StateManager;

	beforeEach(async () => {
		StateManager.resetInstance();
		tempDir = createTempDir();
		manager = new StateManager({ stateDir: tempDir });
	});

	afterEach(async () => {
		StateManager.resetInstance();
		// Cleanup temp directory
		try {
			await Bun.$`rm -rf ${tempDir}`.quiet();
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("singleton", () => {
		test("getInstance returns same instance", () => {
			StateManager.resetInstance();
			const instance1 = StateManager.getInstance({ stateDir: tempDir });
			const instance2 = StateManager.getInstance({ stateDir: tempDir });

			expect(instance1).toBe(instance2);
		});

		test("resetInstance clears singleton", () => {
			StateManager.resetInstance();
			const instance1 = StateManager.getInstance({ stateDir: tempDir });
			StateManager.resetInstance();
			const instance2 = StateManager.getInstance({ stateDir: tempDir });

			expect(instance1).not.toBe(instance2);
		});

		test("getStateDir returns configured directory", () => {
			expect(manager.getStateDir()).toBe(tempDir);
		});
	});

	describe("ensureStateDir", () => {
		test("creates state directory if it doesn't exist", async () => {
			const newDir = createTempDir();
			const newManager = new StateManager({ stateDir: newDir });

			// Install a module (which calls ensureStateDir internally)
			await newManager.installModule("test-module");

			// Check directory exists using test command
			const result = await Bun.$`test -d ${newDir}`.nothrow().quiet();
			expect(result.exitCode).toBe(0);

			// Cleanup
			await Bun.$`rm -rf ${newDir}`.quiet();
		});
	});

	describe("installed modules", () => {
		test("getInstalledState returns empty state when no file exists", async () => {
			const state = await manager.getInstalledState();

			expect(state.modules).toEqual({});
		});

		test("isModuleInstalled returns false for uninstalled module", async () => {
			const result = await manager.isModuleInstalled("dvwa");

			expect(result).toBe(false);
		});

		test("installModule adds module to state", async () => {
			await manager.installModule("dvwa");

			const isInstalled = await manager.isModuleInstalled("dvwa");
			expect(isInstalled).toBe(true);
		});

		test("installModule stores installedAt timestamp", async () => {
			const before = new Date().toISOString();
			await manager.installModule("dvwa");
			const after = new Date().toISOString();

			const info = await manager.getModuleInstallInfo("dvwa");
			expect(info).toBeDefined();
			expect(info?.installedAt).toBeDefined();
			// Use optional chaining for safe access, with fallback for comparison
			const installedAt = info?.installedAt ?? "";
			expect(installedAt >= before).toBe(true);
			expect(installedAt <= after).toBe(true);
		});

		test("installModule stores version if provided", async () => {
			await manager.installModule("dvwa", "1.0.0");

			const info = await manager.getModuleInstallInfo("dvwa");
			expect(info?.version).toBe("1.0.0");
		});

		test("installModule preserves existing modules", async () => {
			await manager.installModule("dvwa");
			await manager.installModule("juice-shop");

			expect(await manager.isModuleInstalled("dvwa")).toBe(true);
			expect(await manager.isModuleInstalled("juice-shop")).toBe(true);
		});

		test("isModuleInstalled is case-insensitive", async () => {
			await manager.installModule("DVWA");

			expect(await manager.isModuleInstalled("dvwa")).toBe(true);
			expect(await manager.isModuleInstalled("DVWA")).toBe(true);
			expect(await manager.isModuleInstalled("DvWa")).toBe(true);
		});

		test("removeModule removes module from state", async () => {
			await manager.installModule("dvwa");
			await manager.removeModule("dvwa");

			expect(await manager.isModuleInstalled("dvwa")).toBe(false);
		});

		test("removeModule preserves other modules", async () => {
			await manager.installModule("dvwa");
			await manager.installModule("juice-shop");
			await manager.removeModule("dvwa");

			expect(await manager.isModuleInstalled("dvwa")).toBe(false);
			expect(await manager.isModuleInstalled("juice-shop")).toBe(true);
		});

		test("removeModule handles non-existent module gracefully", async () => {
			// Should not throw
			await manager.removeModule("nonexistent");
			expect(await manager.isModuleInstalled("nonexistent")).toBe(false);
		});

		test("getInstalledModuleNames returns list of installed modules", async () => {
			await manager.installModule("dvwa");
			await manager.installModule("juice-shop");

			const names = await manager.getInstalledModuleNames();
			expect(names).toContain("dvwa");
			expect(names).toContain("juice-shop");
			expect(names).toHaveLength(2);
		});

		test("getModuleInstallInfo returns null for uninstalled module", async () => {
			const info = await manager.getModuleInstallInfo("nonexistent");
			expect(info).toBeNull();
		});
	});

	describe("installed.yml persistence", () => {
		test("state persists across manager instances", async () => {
			await manager.installModule("dvwa");

			// Create new manager instance with same state dir
			StateManager.resetInstance();
			const manager2 = new StateManager({ stateDir: tempDir });

			expect(await manager2.isModuleInstalled("dvwa")).toBe(true);
		});

		test("handles invalid installed.yml gracefully", async () => {
			// Write invalid YAML to installed.yml
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(join(tempDir, "installed.yml"), "invalid: yaml: content");

			const state = await manager.getInstalledState();
			expect(state.modules).toEqual({});
		});

		test("handles malformed installed.yml schema gracefully", async () => {
			// Write valid YAML but invalid schema
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(
				join(tempDir, "installed.yml"),
				yamlStringify({
					modules: "not-an-object",
				}),
			);

			const state = await manager.getInstalledState();
			expect(state.modules).toEqual({});
		});
	});

	describe("lock mode", () => {
		test("getLockState returns empty state when no lock file exists", async () => {
			const state = await manager.getLockState();

			expect(state.locked).toBe(false);
			expect(state.modules).toEqual([]);
		});

		test("isLocked returns false when not locked", async () => {
			expect(await manager.isLocked()).toBe(false);
		});

		test("enableLock creates lock file", async () => {
			await manager.enableLock();

			expect(await manager.isLocked()).toBe(true);
		});

		test("enableLock captures installed modules", async () => {
			await manager.installModule("dvwa");
			await manager.installModule("juice-shop");
			await manager.enableLock();

			const locked = await manager.getLockedModules();
			expect(locked).toContain("dvwa");
			expect(locked).toContain("juice-shop");
		});

		test("enableLock stores metadata", async () => {
			await manager.enableLock({
				message: "Production deployment",
				lockedBy: "test-user",
			});

			const state = await manager.getLockState();
			expect(state.locked).toBe(true);
			expect(state.message).toBe("Production deployment");
			expect(state.lockedBy).toBe("test-user");
			expect(state.lockedAt).toBeDefined();
		});

		test("enableLock uses USER env var for lockedBy if not specified", async () => {
			const originalUser = process.env.USER;
			process.env.USER = "env-test-user";

			await manager.enableLock();

			const state = await manager.getLockState();
			expect(state.lockedBy).toBe("env-test-user");

			// Restore
			process.env.USER = originalUser;
		});

		test("disableLock removes lock file", async () => {
			await manager.enableLock();
			await manager.disableLock();

			expect(await manager.isLocked()).toBe(false);
		});

		test("disableLock handles missing lock file gracefully", async () => {
			// Should not throw
			await manager.disableLock();
			expect(await manager.isLocked()).toBe(false);
		});

		test("getLockedModules returns empty array when not locked", async () => {
			const modules = await manager.getLockedModules();
			expect(modules).toEqual([]);
		});
	});

	describe("legacy lock file format", () => {
		test("reads legacy newline-separated format", async () => {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(join(tempDir, "katana.lock"), "dvwa\njuice-shop\nbwapp\n");

			const state = await manager.getLockState();
			expect(state.locked).toBe(true);
			expect(state.modules).toEqual(["dvwa", "juice-shop", "bwapp"]);
		});

		test("reads legacy format with extra whitespace", async () => {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(join(tempDir, "katana.lock"), "  dvwa  \n\njuice-shop\n  \n");

			const state = await manager.getLockState();
			expect(state.locked).toBe(true);
			expect(state.modules).toEqual(["dvwa", "juice-shop"]);
		});

		test("empty legacy file means not locked", async () => {
			await Bun.$`mkdir -p ${tempDir}`.quiet();
			await Bun.write(join(tempDir, "katana.lock"), "");

			const state = await manager.getLockState();
			expect(state.locked).toBe(false);
		});

		test("writes new YAML format when enabling lock", async () => {
			await manager.installModule("dvwa");
			await manager.enableLock({ message: "Test" });

			const content = await Bun.file(join(tempDir, "katana.lock")).text();
			expect(content).toContain("locked: true");
			expect(content).toContain("modules:");
			expect(content).toContain("message: Test");
		});
	});

	describe("lock file persistence", () => {
		test("lock state persists across manager instances", async () => {
			await manager.enableLock({ message: "Persistent lock" });

			StateManager.resetInstance();
			const manager2 = new StateManager({ stateDir: tempDir });

			expect(await manager2.isLocked()).toBe(true);
			const state = await manager2.getLockState();
			expect(state.message).toBe("Persistent lock");
		});
	});

	describe("module status", () => {
		test("returns NOT_INSTALLED for uninstalled module", async () => {
			const status = await manager.getModuleStatus("dvwa");
			expect(status).toBe(ModuleStatus.NOT_INSTALLED);
		});

		test("returns INSTALLED for installed module", async () => {
			await manager.installModule("dvwa");

			const status = await manager.getModuleStatus("dvwa");
			expect(status).toBe(ModuleStatus.INSTALLED);
		});

		test("status check is case-insensitive", async () => {
			await manager.installModule("dvwa");

			expect(await manager.getModuleStatus("DVWA")).toBe(ModuleStatus.INSTALLED);
			expect(await manager.getModuleStatus("DvWa")).toBe(ModuleStatus.INSTALLED);
		});
	});
});

describe("convenience functions", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = createTempDir();
		StateManager.resetInstance();
	});

	afterEach(async () => {
		StateManager.resetInstance();
		try {
			await Bun.$`rm -rf ${tempDir}`.quiet();
		} catch {
			// Ignore cleanup errors
		}
	});

	test("getStateManager returns singleton instance", () => {
		const instance1 = getStateManager({ stateDir: tempDir });
		const instance2 = getStateManager({ stateDir: tempDir });

		expect(instance1).toBe(instance2);
	});
});
