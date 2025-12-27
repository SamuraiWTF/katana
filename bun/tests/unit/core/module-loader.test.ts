import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
	ModuleLoader,
	formatModuleLoadError,
	formatModuleLoaderErrors,
	loadAllModules,
	loadModule,
	validateModuleFile,
} from "../../../src/core/module-loader";

const MODULES_DIR = resolve(import.meta.dir, "..", "..", "..", "..", "modules");

describe("ModuleLoader", () => {
	beforeEach(() => {
		ModuleLoader.resetInstance();
	});

	afterEach(() => {
		ModuleLoader.resetInstance();
	});

	describe("loadAll", () => {
		test("loads all modules from modules directory", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadAll();

			expect(result.modules.length).toBeGreaterThan(0);
			expect(result.success).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test("each module has sourcePath and sourceDir", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadAll();

			for (const module of result.modules) {
				expect(module.sourcePath).toBeDefined();
				expect(module.sourcePath).toEndWith(".yml");
				expect(module.sourceDir).toBeDefined();
			}
		});

		test("filters by category", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadAll({ category: "targets" });

			expect(result.modules.length).toBeGreaterThan(0);
			expect(result.modules.every((m) => m.category === "targets")).toBe(true);
		});

		test("filters by tools category", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadAll({ category: "tools" });

			expect(result.modules.length).toBeGreaterThan(0);
			expect(result.modules.every((m) => m.category === "tools")).toBe(true);
		});
	});

	describe("loadFromFile", () => {
		test("loads dvwa.yml correctly", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadFromFile(
				resolve(MODULES_DIR, "targets", "dvwa.yml"),
			);

			expect(result.success).toBe(true);
			expect(result.module?.name).toBe("dvwa");
			expect(result.module?.category).toBe("targets");
			expect(result.module?.sourcePath).toContain("dvwa.yml");
		});

		test("returns error for nonexistent file", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadFromFile("/nonexistent/file.yml");

			expect(result.success).toBe(false);
			expect(result.error?.type).toBe("file_read");
			expect(result.error?.message).toContain("File not found");
		});

		test("returns error for invalid YAML", async () => {
			// Create a temp file with invalid YAML
			const tempFile = `/tmp/invalid-yaml-${Date.now()}.yml`;
			await Bun.write(tempFile, "name: test\n  invalid: indentation");

			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadFromFile(tempFile);

			expect(result.success).toBe(false);
			expect(result.error?.type).toBe("yaml_parse");

			// Cleanup
			await Bun.file(tempFile).exists() &&
				(await Bun.write(tempFile, "").then(() => {}));
		});

		test("returns validation error for invalid module schema", async () => {
			// Create a temp file with valid YAML but invalid module schema
			const tempFile = `/tmp/invalid-module-${Date.now()}.yml`;
			await Bun.write(
				tempFile,
				`
name: test
category: invalid_category
`,
			);

			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadFromFile(tempFile);

			expect(result.success).toBe(false);
			expect(result.error?.type).toBe("validation");
		});
	});

	describe("loadByName", () => {
		test("finds module by name (case-insensitive)", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadByName("DVWA");

			expect(result.success).toBe(true);
			expect(result.module?.name).toBe("dvwa");
		});

		test("returns error for nonexistent module", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const result = await loader.loadByName("nonexistent-module-xyz");

			expect(result.success).toBe(false);
			expect(result.error?.message).toContain("Module not found");
		});
	});

	describe("getModuleNames", () => {
		test("returns list of module names", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const names = await loader.getModuleNames();

			expect(names.length).toBeGreaterThan(0);
			expect(names).toContain("dvwa");
		});
	});

	describe("getModulesByCategory", () => {
		test("groups modules by category", async () => {
			const loader = new ModuleLoader(MODULES_DIR);
			const byCategory = await loader.getModulesByCategory();

			expect(byCategory.has("targets")).toBe(true);
			expect(byCategory.has("tools")).toBe(true);

			const targets = byCategory.get("targets");
			expect(targets?.length).toBeGreaterThan(0);
			expect(targets?.every((m) => m.category === "targets")).toBe(true);
		});
	});

	describe("caching", () => {
		test("uses cache on repeated calls", async () => {
			const loader = new ModuleLoader(MODULES_DIR);

			const result1 = await loader.loadAll();
			const result2 = await loader.loadAll();

			// Both should load the same number of modules
			expect(result1.modules.length).toBeGreaterThan(0);
			expect(result2.modules.length).toBeGreaterThan(0);
			expect(result1.modules.length).toBe(result2.modules.length);
		});

		test("invalidateCache clears cached data", async () => {
			const loader = new ModuleLoader(MODULES_DIR);

			await loader.loadAll();
			loader.invalidateCache();

			// Cache should be cleared, but loadByName should still work (it reloads)
			const result = await loader.loadByName("dvwa");
			expect(result.success).toBe(true);
		});

		test("bypasses cache when useCache is false", async () => {
			const loader = new ModuleLoader(MODULES_DIR);

			await loader.loadAll();
			const result = await loader.loadAll({ useCache: false });

			// Should still load modules even without cache
			expect(result.modules.length).toBeGreaterThan(0);
		});
	});

	describe("singleton", () => {
		test("getInstance returns same instance", () => {
			const instance1 = ModuleLoader.getInstance();
			const instance2 = ModuleLoader.getInstance();

			expect(instance1).toBe(instance2);
		});

		test("resetInstance clears singleton", () => {
			const instance1 = ModuleLoader.getInstance();
			ModuleLoader.resetInstance();
			const instance2 = ModuleLoader.getInstance();

			expect(instance1).not.toBe(instance2);
		});
	});
});

describe("convenience functions", () => {
	beforeEach(() => {
		ModuleLoader.resetInstance();
	});

	test("loadAllModules works", async () => {
		const result = await loadAllModules();
		expect(result.modules.length).toBeGreaterThan(0);
	});

	test("loadModule works", async () => {
		const result = await loadModule("dvwa");
		expect(result.success).toBe(true);
		expect(result.module?.name).toBe("dvwa");
	});

	test("validateModuleFile works", async () => {
		const result = await validateModuleFile(
			resolve(MODULES_DIR, "targets", "dvwa.yml"),
		);
		expect(result.success).toBe(true);
	});
});

describe("error formatting", () => {
	test("formatModuleLoadError formats file read error", () => {
		const error = {
			filePath: "/path/to/file.yml",
			type: "file_read" as const,
			message: "File not found",
		};

		const formatted = formatModuleLoadError(error);
		expect(formatted).toContain("File Read Error");
		expect(formatted).toContain("/path/to/file.yml");
		expect(formatted).toContain("File not found");
	});

	test("formatModuleLoadError formats YAML error with line number", () => {
		const error = {
			filePath: "/path/to/file.yml",
			type: "yaml_parse" as const,
			message: "Unexpected token",
			line: 10,
			column: 5,
		};

		const formatted = formatModuleLoadError(error);
		expect(formatted).toContain("YAML Parse Error");
		expect(formatted).toContain("line 10:5");
	});

	test("formatModuleLoaderErrors formats multiple errors", () => {
		const result = {
			modules: [],
			errors: [
				{
					filePath: "/path/to/file1.yml",
					type: "file_read" as const,
					message: "Error 1",
				},
				{
					filePath: "/path/to/file2.yml",
					type: "validation" as const,
					message: "Error 2",
				},
			],
			success: false,
		};

		const formatted = formatModuleLoaderErrors(result);
		expect(formatted).toContain("file1.yml");
		expect(formatted).toContain("file2.yml");
		expect(formatted).toContain("Error 1");
		expect(formatted).toContain("Error 2");
	});

	test("formatModuleLoaderErrors returns empty string for no errors", () => {
		const result = {
			modules: [],
			errors: [],
			success: true,
		};

		expect(formatModuleLoaderErrors(result)).toBe("");
	});
});
