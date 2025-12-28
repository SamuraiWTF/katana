import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getPluginRegistry, PluginRegistry } from "../../../src/plugins/registry";
import { BasePlugin, type ExecutionContext, type PluginResult } from "../../../src/types/plugin";

// Simple test plugin
class TestPlugin extends BasePlugin {
	readonly name = "test";

	async execute(params: unknown, context: ExecutionContext): Promise<PluginResult> {
		return this.success("test executed");
	}
}

describe("PluginRegistry", () => {
	beforeEach(() => {
		PluginRegistry.resetInstance();
	});

	afterEach(() => {
		PluginRegistry.resetInstance();
	});

	describe("singleton", () => {
		test("returns same instance", () => {
			const instance1 = PluginRegistry.getInstance();
			const instance2 = PluginRegistry.getInstance();
			expect(instance1).toBe(instance2);
		});

		test("resetInstance creates new instance", () => {
			const instance1 = PluginRegistry.getInstance();
			PluginRegistry.resetInstance();
			const instance2 = PluginRegistry.getInstance();
			expect(instance1).not.toBe(instance2);
		});

		test("getPluginRegistry convenience function works", () => {
			const registry = getPluginRegistry();
			expect(registry).toBeInstanceOf(PluginRegistry);
		});
	});

	describe("register", () => {
		test("registers a plugin by alias", () => {
			const registry = getPluginRegistry();
			const plugin = new TestPlugin();

			registry.register("test", plugin);

			expect(registry.has("test")).toBe(true);
			expect(registry.get("test")).toBe(plugin);
		});

		test("overwrites existing plugin with same alias", () => {
			const registry = getPluginRegistry();
			const plugin1 = new TestPlugin();
			const plugin2 = new TestPlugin();

			registry.register("test", plugin1);
			registry.register("test", plugin2);

			expect(registry.get("test")).toBe(plugin2);
		});
	});

	describe("get", () => {
		test("returns undefined for unknown alias", () => {
			const registry = getPluginRegistry();
			expect(registry.get("unknown")).toBeUndefined();
		});
	});

	describe("has", () => {
		test("returns false for unknown alias", () => {
			const registry = getPluginRegistry();
			expect(registry.has("unknown")).toBe(false);
		});

		test("returns true for registered alias", () => {
			const registry = getPluginRegistry();
			registry.register("test", new TestPlugin());
			expect(registry.has("test")).toBe(true);
		});
	});

	describe("getAll", () => {
		test("returns copy of all plugins", () => {
			const registry = getPluginRegistry();
			const plugin = new TestPlugin();
			registry.register("test", plugin);

			const all = registry.getAll();

			expect(all.size).toBe(1);
			expect(all.get("test")).toBe(plugin);

			// Verify it's a copy
			all.delete("test");
			expect(registry.has("test")).toBe(true);
		});
	});

	describe("getAliases", () => {
		test("returns list of registered aliases", () => {
			const registry = getPluginRegistry();
			registry.register("plugin1", new TestPlugin());
			registry.register("plugin2", new TestPlugin());

			const aliases = registry.getAliases();

			expect(aliases).toContain("plugin1");
			expect(aliases).toContain("plugin2");
			expect(aliases.length).toBe(2);
		});
	});

	describe("clear", () => {
		test("removes all plugins", () => {
			const registry = getPluginRegistry();
			registry.register("test", new TestPlugin());
			registry.clear();

			expect(registry.has("test")).toBe(false);
			expect(registry.getAliases().length).toBe(0);
		});
	});

	describe("loadBuiltinPlugins", () => {
		test("loads all built-in plugins", async () => {
			const registry = getPluginRegistry();
			await registry.loadBuiltinPlugins();

			// Check all expected plugins are registered
			expect(registry.has("docker")).toBe(true);
			expect(registry.has("service")).toBe(true);
			expect(registry.has("lineinfile")).toBe(true);
			expect(registry.has("reverseproxy")).toBe(true);
			expect(registry.has("file")).toBe(true);
			expect(registry.has("copy")).toBe(true);
			expect(registry.has("git")).toBe(true);
			expect(registry.has("command")).toBe(true);
			expect(registry.has("rm")).toBe(true);
			expect(registry.has("get_url")).toBe(true);
			expect(registry.has("unarchive")).toBe(true);
			expect(registry.has("replace")).toBe(true);
			expect(registry.has("desktop")).toBe(true);
		});
	});
});
