import { afterAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const BUN_DIR = resolve(import.meta.dir, "..", "..");
const MODULES_DIR = resolve(BUN_DIR, "..", "modules");
const BUN_BIN = resolve(process.env.HOME || "", ".bun", "bin", "bun");

// Helper to run CLI commands
async function cli(args: string): Promise<{
	stdout: string;
	stderr: string;
	exitCode: number;
}> {
	const proc = Bun.spawn([BUN_BIN, "run", "src/cli.ts", ...args.split(" ")], {
		cwd: BUN_DIR,
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { stdout, stderr, exitCode };
}

// Track temp files for cleanup
const tempFiles: string[] = [];

afterAll(async () => {
	for (const file of tempFiles) {
		try {
			(await Bun.file(file).exists()) && (await Bun.write(file, ""));
		} catch {
			// Ignore cleanup errors
		}
	}
});

// =============================================================================
// list command
// =============================================================================

describe("list command", () => {
	test("lists all modules", async () => {
		const result = await cli("list");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("NAME");
		expect(result.stdout).toContain("CATEGORY");
		expect(result.stdout).toContain("DESCRIPTION");
		expect(result.stdout).toContain("Total:");
		expect(result.stdout).toContain("module(s)");
	});

	test("filters by targets category", async () => {
		const result = await cli("list targets");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("targets");
		expect(result.stdout).toContain("dvwa");
		// Should not contain other categories
		expect(result.stdout).not.toMatch(/\btools\b/);
	});

	test("filters by tools category", async () => {
		const result = await cli("list tools");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("tools");
		// Should not contain other categories
		expect(result.stdout).not.toMatch(/\btargets\b/);
	});

	test("shows no modules message for invalid category", async () => {
		const result = await cli("list invalid_category");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("No modules found");
	});

	test("shows warning when some modules fail to load", async () => {
		// Create an invalid module file temporarily
		const invalidFile = resolve(MODULES_DIR, "targets", "_test_invalid_module.yml");
		tempFiles.push(invalidFile);
		await Bun.write(invalidFile, "name: test\ncategory: invalid_category_xyz");

		try {
			const result = await cli("list");

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Total:");
			expect(result.stderr).toContain("Warning:");
			expect(result.stderr).toContain("module(s) failed to load");
		} finally {
			// Clean up immediately
			(await Bun.file(invalidFile).exists()) && (await Bun.$`rm ${invalidFile}`.quiet());
		}
	});
});

// =============================================================================
// validate command
// =============================================================================

describe("validate command", () => {
	test("validates a valid module file", async () => {
		const dvwaPath = resolve(MODULES_DIR, "targets", "dvwa.yml");
		const result = await cli(`validate ${dvwaPath}`);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Valid:");
		expect(result.stdout).toContain("dvwa");
		expect(result.stdout).toContain("targets");
	});

	test("errors on non-existent file", async () => {
		const result = await cli("validate /nonexistent/path/file.yml");

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("File Read Error");
		expect(result.stderr).toContain("File not found");
	});

	test("errors on invalid YAML syntax", async () => {
		const tempFile = `/tmp/cli-test-invalid-yaml-${Date.now()}.yml`;
		tempFiles.push(tempFile);
		await Bun.write(tempFile, "name: test\n  invalid: indentation");

		const result = await cli(`validate ${tempFile}`);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("YAML Parse Error");
	});

	test("errors on invalid module schema", async () => {
		const tempFile = `/tmp/cli-test-invalid-schema-${Date.now()}.yml`;
		tempFiles.push(tempFile);
		await Bun.write(
			tempFile,
			`
name: test
category: invalid_category_value
`,
		);

		const result = await cli(`validate ${tempFile}`);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Validation Error");
	});
});

// =============================================================================
// status command
// =============================================================================

describe("status command", () => {
	test("shows status for existing module", async () => {
		const result = await cli("status dvwa");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Module: dvwa");
		expect(result.stdout).toContain("Category: targets");
		expect(result.stdout).toContain("not yet implemented");
	});

	test("finds module with case-insensitive name", async () => {
		const result = await cli("status DVWA");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Module: dvwa");
		expect(result.stdout).toContain("Category: targets");
	});

	test("errors on non-existent module", async () => {
		const result = await cli("status nonexistent_module_xyz");

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Module not found");
	});
});

// =============================================================================
// stub commands
// =============================================================================

describe("stub commands", () => {
	const stubs = [
		{ cmd: "init", name: "init" },
		{ cmd: "install testmod", name: "install" },
		{ cmd: "remove testmod", name: "remove" },
		{ cmd: "start testmod", name: "start" },
		{ cmd: "stop testmod", name: "stop" },
		{ cmd: "lock", name: "lock" },
		{ cmd: "unlock", name: "unlock" },
		{ cmd: "update", name: "update" },
	];

	for (const { cmd, name } of stubs) {
		test(`${name} shows not implemented`, async () => {
			const result = await cli(cmd);

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("not yet implemented");
		});
	}
});

// =============================================================================
// help and version
// =============================================================================

describe("help and version", () => {
	test("--help shows usage information", async () => {
		const result = await cli("--help");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Usage:");
		expect(result.stdout).toContain("katana");
		expect(result.stdout).toContain("list");
		expect(result.stdout).toContain("validate");
		expect(result.stdout).toContain("status");
	});

	test("--version shows version number", async () => {
		const result = await cli("--version");

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("0.1.0");
	});
});
