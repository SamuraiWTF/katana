import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { DependencyResolver } from "../../../src/core/dependencies";
import type { LoadedModule } from "../../../src/core/module-loader";
import type { ModuleCategory } from "../../../src/types";

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create mock LoadedModule objects for testing
 */
function createMockModule(
	name: string,
	dependsOn: string[] = [],
	category: ModuleCategory = "targets",
): LoadedModule {
	return {
		name,
		category,
		"depends-on": dependsOn,
		sourcePath: `/mock/${name}.yml`,
		sourceDir: "/mock",
	};
}

/**
 * Create multiple mock modules from specs
 */
function createMockModules(
	specs: Array<{ name: string; dependsOn?: string[]; category?: ModuleCategory }>,
): LoadedModule[] {
	return specs.map((spec) => createMockModule(spec.name, spec.dependsOn ?? [], spec.category));
}

// =============================================================================
// Tests
// =============================================================================

describe("DependencyResolver", () => {
	describe("buildGraph", () => {
		test("builds graph from modules with dependencies", () => {
			const modules = createMockModules([
				{ name: "a", dependsOn: ["b", "c"] },
				{ name: "b", dependsOn: ["c"] },
				{ name: "c", dependsOn: [] },
			]);

			const resolver = new DependencyResolver(modules);
			const graph = resolver.buildGraph();

			expect(graph.nodes.has("a")).toBe(true);
			expect(graph.nodes.has("b")).toBe(true);
			expect(graph.nodes.has("c")).toBe(true);
			expect(graph.edges.get("a")).toEqual(["b", "c"]);
			expect(graph.edges.get("b")).toEqual(["c"]);
			expect(graph.edges.get("c")).toEqual([]);
		});

		test("handles modules with no dependencies", () => {
			const modules = createMockModules([{ name: "standalone1" }, { name: "standalone2" }]);

			const resolver = new DependencyResolver(modules);
			const graph = resolver.buildGraph();

			expect(graph.nodes.size).toBe(2);
			expect(graph.edges.get("standalone1")).toEqual([]);
			expect(graph.edges.get("standalone2")).toEqual([]);
		});

		test("normalizes module names to lowercase", () => {
			const modules = createMockModules([
				{ name: "ModuleA", dependsOn: ["ModuleB"] },
				{ name: "ModuleB" },
			]);

			const resolver = new DependencyResolver(modules);
			const graph = resolver.buildGraph();

			expect(graph.nodes.has("modulea")).toBe(true);
			expect(graph.nodes.has("moduleb")).toBe(true);
			expect(graph.edges.get("modulea")).toEqual(["moduleb"]);
		});

		test("adds dependency nodes even if module not loaded", () => {
			const modules = createMockModules([{ name: "app", dependsOn: ["nonexistent"] }]);

			const resolver = new DependencyResolver(modules);
			const graph = resolver.buildGraph();

			expect(graph.nodes.has("app")).toBe(true);
			expect(graph.nodes.has("nonexistent")).toBe(true);
		});
	});

	describe("detectCircularDependencies", () => {
		test("detects simple cycle A -> B -> A", () => {
			const modules = createMockModules([
				{ name: "a", dependsOn: ["b"] },
				{ name: "b", dependsOn: ["a"] },
			]);

			const resolver = new DependencyResolver(modules);
			const errors = resolver.detectCircularDependencies();

			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]!.type).toBe("circular");
			expect(errors[0]!.details.chain).toBeDefined();
			// The cycle should contain both a and b
			const chain = errors[0]!.details.chain!;
			expect(chain.includes("a")).toBe(true);
			expect(chain.includes("b")).toBe(true);
		});

		test("detects longer cycle A -> B -> C -> A", () => {
			const modules = createMockModules([
				{ name: "a", dependsOn: ["b"] },
				{ name: "b", dependsOn: ["c"] },
				{ name: "c", dependsOn: ["a"] },
			]);

			const resolver = new DependencyResolver(modules);
			const errors = resolver.detectCircularDependencies();

			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]!.type).toBe("circular");
		});

		test("returns empty array when no cycles", () => {
			const modules = createMockModules([
				{ name: "app", dependsOn: ["db", "cache"] },
				{ name: "db", dependsOn: ["base"] },
				{ name: "cache", dependsOn: ["base"] },
				{ name: "base", dependsOn: [] },
			]);

			const resolver = new DependencyResolver(modules);
			const errors = resolver.detectCircularDependencies();

			expect(errors).toEqual([]);
		});

		test("detects self-dependency", () => {
			const modules = createMockModules([{ name: "self", dependsOn: ["self"] }]);

			const resolver = new DependencyResolver(modules);
			const errors = resolver.detectCircularDependencies();

			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]!.type).toBe("circular");
		});

		test("provides clear error message with cycle path", () => {
			const modules = createMockModules([
				{ name: "a", dependsOn: ["b"] },
				{ name: "b", dependsOn: ["a"] },
			]);

			const resolver = new DependencyResolver(modules);
			const errors = resolver.detectCircularDependencies();

			expect(errors[0]!.message).toContain("Circular dependency detected");
			expect(errors[0]!.message).toContain("->");
		});
	});

	describe("validateDependencies", () => {
		test("detects missing dependencies", () => {
			const modules = createMockModules([{ name: "app", dependsOn: ["nonexistent"] }]);

			const resolver = new DependencyResolver(modules);
			const errors = resolver.validateDependencies();

			expect(errors.length).toBe(1);
			expect(errors[0]!.type).toBe("missing");
			expect(errors[0]!.details.missing).toBe("nonexistent");
			expect(errors[0]!.details.module).toBe("app");
		});

		test("returns empty array when all dependencies exist", () => {
			const modules = createMockModules([{ name: "app", dependsOn: ["lib"] }, { name: "lib" }]);

			const resolver = new DependencyResolver(modules);
			const errors = resolver.validateDependencies();

			expect(errors).toEqual([]);
		});

		test("detects multiple missing dependencies", () => {
			const modules = createMockModules([{ name: "app", dependsOn: ["missing1", "missing2"] }]);

			const resolver = new DependencyResolver(modules);
			const errors = resolver.validateDependencies();

			expect(errors.length).toBe(2);
		});
	});

	describe("getInstallOrder", () => {
		test("returns correct topological order for linear chain", () => {
			const modules = createMockModules([
				{ name: "app", dependsOn: ["middleware"] },
				{ name: "middleware", dependsOn: ["base"] },
				{ name: "base", dependsOn: [] },
			]);

			const resolver = new DependencyResolver(modules);
			const result = resolver.getInstallOrder("app");

			expect(result.success).toBe(true);
			expect(result.order.length).toBe(3);

			// base should come before middleware, middleware before app
			const baseIdx = result.order.indexOf("base");
			const middleIdx = result.order.indexOf("middleware");
			const appIdx = result.order.indexOf("app");

			expect(baseIdx).toBeLessThan(middleIdx);
			expect(middleIdx).toBeLessThan(appIdx);
		});

		test("returns correct topological order for diamond dependency", () => {
			const modules = createMockModules([
				{ name: "app", dependsOn: ["db", "cache"] },
				{ name: "db", dependsOn: ["base"] },
				{ name: "cache", dependsOn: ["base"] },
				{ name: "base", dependsOn: [] },
			]);

			const resolver = new DependencyResolver(modules);
			const result = resolver.getInstallOrder("app");

			expect(result.success).toBe(true);
			expect(result.order.length).toBe(4);

			// base should come before db and cache
			const baseIdx = result.order.indexOf("base");
			const dbIdx = result.order.indexOf("db");
			const cacheIdx = result.order.indexOf("cache");
			const appIdx = result.order.indexOf("app");

			expect(baseIdx).toBeLessThan(dbIdx);
			expect(baseIdx).toBeLessThan(cacheIdx);
			expect(dbIdx).toBeLessThan(appIdx);
			expect(cacheIdx).toBeLessThan(appIdx);
		});

		test("fails with error for circular dependencies", () => {
			const modules = createMockModules([
				{ name: "a", dependsOn: ["b"] },
				{ name: "b", dependsOn: ["a"] },
			]);

			const resolver = new DependencyResolver(modules);
			const result = resolver.getInstallOrder("a");

			expect(result.success).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]!.type).toBe("circular");
		});

		test("fails with error for missing target module", () => {
			const modules = createMockModules([{ name: "existing" }]);

			const resolver = new DependencyResolver(modules);
			const result = resolver.getInstallOrder("nonexistent");

			expect(result.success).toBe(false);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0]!.type).toBe("missing");
		});

		test("fails with error for missing dependency", () => {
			const modules = createMockModules([{ name: "app", dependsOn: ["nonexistent"] }]);

			const resolver = new DependencyResolver(modules);
			const result = resolver.getInstallOrder("app");

			expect(result.success).toBe(false);
			expect(result.errors[0]!.type).toBe("missing");
		});

		test("only includes transitive dependencies of target", () => {
			const modules = createMockModules([
				{ name: "app1", dependsOn: ["shared"] },
				{ name: "app2", dependsOn: ["other"] },
				{ name: "shared" },
				{ name: "other" },
			]);

			const resolver = new DependencyResolver(modules);
			const result = resolver.getInstallOrder("app1");

			expect(result.success).toBe(true);
			expect(result.order).toContain("app1");
			expect(result.order).toContain("shared");
			expect(result.order).not.toContain("app2");
			expect(result.order).not.toContain("other");
		});

		test("returns single item for module with no dependencies", () => {
			const modules = createMockModules([{ name: "standalone" }]);

			const resolver = new DependencyResolver(modules);
			const result = resolver.getInstallOrder("standalone");

			expect(result.success).toBe(true);
			expect(result.order).toEqual(["standalone"]);
		});

		test("handles case-insensitive module names", () => {
			const modules = createMockModules([
				{ name: "MyApp", dependsOn: ["MyLib"] },
				{ name: "MyLib" },
			]);

			const resolver = new DependencyResolver(modules);
			const result = resolver.getInstallOrder("myapp");

			expect(result.success).toBe(true);
			expect(result.order.length).toBe(2);
		});
	});

	describe("getDependents", () => {
		test("returns modules that depend on given module", () => {
			const modules = createMockModules([
				{ name: "app1", dependsOn: ["shared"] },
				{ name: "app2", dependsOn: ["shared"] },
				{ name: "shared" },
				{ name: "standalone" },
			]);

			const resolver = new DependencyResolver(modules);
			const dependents = resolver.getDependents("shared");

			expect(dependents).toContain("app1");
			expect(dependents).toContain("app2");
			expect(dependents).not.toContain("standalone");
			expect(dependents).not.toContain("shared");
		});

		test("returns empty array if no modules depend on it", () => {
			const modules = createMockModules([{ name: "app", dependsOn: ["lib"] }, { name: "lib" }]);

			const resolver = new DependencyResolver(modules);
			const dependents = resolver.getDependents("app");

			expect(dependents).toEqual([]);
		});

		test("handles case-insensitive lookup", () => {
			const modules = createMockModules([
				{ name: "App", dependsOn: ["Shared"] },
				{ name: "Shared" },
			]);

			const resolver = new DependencyResolver(modules);
			const dependents = resolver.getDependents("SHARED");

			expect(dependents).toContain("app");
		});
	});

	describe("hasDependencies", () => {
		test("returns true if module has dependencies", () => {
			const modules = createMockModules([{ name: "app", dependsOn: ["lib"] }, { name: "lib" }]);

			const resolver = new DependencyResolver(modules);

			expect(resolver.hasDependencies("app")).toBe(true);
		});

		test("returns false if module has no dependencies", () => {
			const modules = createMockModules([{ name: "standalone" }]);

			const resolver = new DependencyResolver(modules);

			expect(resolver.hasDependencies("standalone")).toBe(false);
		});
	});

	describe("getDependencies", () => {
		test("returns direct dependencies of module", () => {
			const modules = createMockModules([
				{ name: "app", dependsOn: ["db", "cache"] },
				{ name: "db" },
				{ name: "cache" },
			]);

			const resolver = new DependencyResolver(modules);
			const deps = resolver.getDependencies("app");

			expect(deps).toEqual(["db", "cache"]);
		});

		test("returns empty array for module with no dependencies", () => {
			const modules = createMockModules([{ name: "standalone" }]);

			const resolver = new DependencyResolver(modules);

			expect(resolver.getDependencies("standalone")).toEqual([]);
		});

		test("returns empty array for unknown module", () => {
			const modules = createMockModules([{ name: "existing" }]);

			const resolver = new DependencyResolver(modules);

			expect(resolver.getDependencies("unknown")).toEqual([]);
		});
	});
});
