import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import { ConfigManager, getConfigManager } from "../../../src/core/config-manager";
import { DEFAULT_CONFIG } from "../../../src/types/config";

// Use crypto.randomUUID for guaranteed uniqueness
const createTempDir = () => `/tmp/katana-config-test-${crypto.randomUUID()}`;

describe("ConfigManager", () => {
	let tempDir: string;

	beforeEach(async () => {
		ConfigManager.resetInstance();
		tempDir = createTempDir();
		await Bun.$`mkdir -p ${tempDir}`.quiet();
	});

	afterEach(async () => {
		ConfigManager.resetInstance();
		try {
			await Bun.$`rm -rf ${tempDir}`.quiet();
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("singleton", () => {
		test("getInstance returns same instance", () => {
			ConfigManager.resetInstance();
			const instance1 = ConfigManager.getInstance();
			const instance2 = ConfigManager.getInstance();

			expect(instance1).toBe(instance2);
		});

		test("resetInstance clears singleton", () => {
			ConfigManager.resetInstance();
			const instance1 = ConfigManager.getInstance();
			ConfigManager.resetInstance();
			const instance2 = ConfigManager.getInstance();

			expect(instance1).not.toBe(instance2);
		});
	});

	describe("loadConfig", () => {
		test("returns DEFAULT_CONFIG when no config file exists", async () => {
			const manager = new ConfigManager({
				configPaths: [join(tempDir, "nonexistent.yml")],
			});

			const config = await manager.loadConfig();

			expect(config).toEqual(DEFAULT_CONFIG);
			expect(manager.getConfigPath()).toBeNull();
		});

		test("loads config from first existing path", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(
				configPath,
				yamlStringify({
					domainBase: "custom",
					modulesPath: "/custom/modules",
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			const config = await manager.loadConfig();

			expect(config.domainBase).toBe("custom");
			expect(config.modulesPath).toBe("/custom/modules");
			expect(manager.getConfigPath()).toBe(configPath);
		});

		test("uses second path if first doesn't exist", async () => {
			const configPath1 = join(tempDir, "config1.yml");
			const configPath2 = join(tempDir, "config2.yml");

			await Bun.write(
				configPath2,
				yamlStringify({
					domainBase: "from-second",
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath1, configPath2],
			});

			const config = await manager.loadConfig();

			expect(config.domainBase).toBe("from-second");
			expect(manager.getConfigPath()).toBe(configPath2);
		});

		test("applies default values for missing fields", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(
				configPath,
				yamlStringify({
					domainBase: "custom",
					// Missing: modulesPath, statePath, server, log
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			const config = await manager.loadConfig();

			expect(config.domainBase).toBe("custom");
			expect(config.modulesPath).toBe(DEFAULT_CONFIG.modulesPath);
			expect(config.statePath).toBe(DEFAULT_CONFIG.statePath);
			expect(config.server.port).toBe(DEFAULT_CONFIG.server.port);
		});

		test("handles invalid YAML gracefully", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(configPath, "invalid: yaml: content:");

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			const config = await manager.loadConfig();

			expect(config).toEqual(DEFAULT_CONFIG);
			expect(manager.getConfigPath()).toBeNull();
		});

		test("handles invalid schema gracefully", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(
				configPath,
				yamlStringify({
					server: {
						port: "not-a-number", // Should be a number
					},
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			const config = await manager.loadConfig();

			expect(config).toEqual(DEFAULT_CONFIG);
			expect(manager.getConfigPath()).toBeNull();
		});

		test("caches config after first load", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(
				configPath,
				yamlStringify({
					domainBase: "cached",
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			const config1 = await manager.loadConfig();
			expect(config1.domainBase).toBe("cached");

			// Modify file after first load
			await Bun.write(
				configPath,
				yamlStringify({
					domainBase: "modified",
				}),
			);

			// Should still return cached value
			const config2 = await manager.loadConfig();
			expect(config2.domainBase).toBe("cached");
			expect(config1).toBe(config2); // Same object reference
		});

		test("reloadConfig forces re-read from file", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(
				configPath,
				yamlStringify({
					domainBase: "original",
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			await manager.loadConfig();

			// Modify file
			await Bun.write(
				configPath,
				yamlStringify({
					domainBase: "reloaded",
				}),
			);

			const config = await manager.reloadConfig();
			expect(config.domainBase).toBe("reloaded");
		});
	});

	describe("getConfig", () => {
		test("returns DEFAULT_CONFIG if not loaded", () => {
			const manager = new ConfigManager({
				configPaths: [join(tempDir, "nonexistent.yml")],
			});

			const config = manager.getConfig();

			expect(config).toEqual(DEFAULT_CONFIG);
		});

		test("returns loaded config after loadConfig", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(
				configPath,
				yamlStringify({
					domainBase: "loaded",
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			await manager.loadConfig();
			const config = manager.getConfig();

			expect(config.domainBase).toBe("loaded");
		});
	});

	describe("isLoaded", () => {
		test("returns false before loadConfig", () => {
			const manager = new ConfigManager({
				configPaths: [join(tempDir, "nonexistent.yml")],
			});

			expect(manager.isLoaded()).toBe(false);
		});

		test("returns true after loadConfig", async () => {
			const manager = new ConfigManager({
				configPaths: [join(tempDir, "nonexistent.yml")],
			});

			await manager.loadConfig();

			expect(manager.isLoaded()).toBe(true);
		});
	});

	describe("server config", () => {
		test("loads server configuration", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(
				configPath,
				yamlStringify({
					server: {
						port: 9000,
						host: "0.0.0.0",
						cors: true,
					},
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			const config = await manager.loadConfig();

			expect(config.server.port).toBe(9000);
			expect(config.server.host).toBe("0.0.0.0");
			expect(config.server.cors).toBe(true);
		});
	});

	describe("log config", () => {
		test("loads log configuration", async () => {
			const configPath = join(tempDir, "config.yml");
			await Bun.write(
				configPath,
				yamlStringify({
					log: {
						level: "debug",
						format: "json",
						file: "/var/log/katana.log",
					},
				}),
			);

			const manager = new ConfigManager({
				configPaths: [configPath],
			});

			const config = await manager.loadConfig();

			expect(config.log.level).toBe("debug");
			expect(config.log.format).toBe("json");
			expect(config.log.file).toBe("/var/log/katana.log");
		});
	});
});

describe("convenience functions", () => {
	beforeEach(() => {
		ConfigManager.resetInstance();
	});

	afterEach(() => {
		ConfigManager.resetInstance();
	});

	test("getConfigManager returns singleton instance", () => {
		const instance1 = getConfigManager();
		const instance2 = getConfigManager();

		expect(instance1).toBe(instance2);
	});
});
