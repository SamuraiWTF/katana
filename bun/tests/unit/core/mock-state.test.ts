import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MockState, getMockState, isMockMode } from "../../../src/core/mock-state";

describe("MockState", () => {
	beforeEach(() => {
		MockState.resetInstance();
	});

	afterEach(() => {
		MockState.resetInstance();
	});

	describe("singleton", () => {
		test("returns same instance", () => {
			const instance1 = MockState.getInstance();
			const instance2 = MockState.getInstance();
			expect(instance1).toBe(instance2);
		});

		test("resetInstance creates new instance", () => {
			const instance1 = MockState.getInstance();
			MockState.resetInstance();
			const instance2 = MockState.getInstance();
			expect(instance1).not.toBe(instance2);
		});

		test("getMockState convenience function works", () => {
			const instance = getMockState();
			expect(instance).toBeInstanceOf(MockState);
		});
	});

	describe("container management", () => {
		test("createContainer creates a new container", () => {
			const mock = getMockState();
			mock.createContainer("test", "nginx:latest", { "80/tcp": 8080 });
			expect(mock.containerExists("test")).toBe(true);
			expect(mock.containerRunning("test")).toBe(false);
		});

		test("startContainer starts a stopped container", () => {
			const mock = getMockState();
			mock.createContainer("test", "nginx:latest", {});
			expect(mock.startContainer("test")).toBe(true);
			expect(mock.containerRunning("test")).toBe(true);
		});

		test("startContainer returns false if already running", () => {
			const mock = getMockState();
			mock.createContainer("test", "nginx:latest", {});
			mock.startContainer("test");
			expect(mock.startContainer("test")).toBe(false);
		});

		test("startContainer returns false if container does not exist", () => {
			const mock = getMockState();
			expect(mock.startContainer("nonexistent")).toBe(false);
		});

		test("stopContainer stops a running container", () => {
			const mock = getMockState();
			mock.createContainer("test", "nginx:latest", {});
			mock.startContainer("test");
			expect(mock.stopContainer("test")).toBe(true);
			expect(mock.containerRunning("test")).toBe(false);
		});

		test("stopContainer returns false if not running", () => {
			const mock = getMockState();
			mock.createContainer("test", "nginx:latest", {});
			expect(mock.stopContainer("test")).toBe(false);
		});

		test("removeContainer removes the container", () => {
			const mock = getMockState();
			mock.createContainer("test", "nginx:latest", {});
			expect(mock.removeContainer("test")).toBe(true);
			expect(mock.containerExists("test")).toBe(false);
		});

		test("removeContainer returns false if does not exist", () => {
			const mock = getMockState();
			expect(mock.removeContainer("nonexistent")).toBe(false);
		});

		test("getContainer returns container state", () => {
			const mock = getMockState();
			mock.createContainer("test", "nginx:latest", { "80/tcp": 8080 });
			const container = mock.getContainer("test");
			expect(container).toEqual({
				name: "test",
				image: "nginx:latest",
				ports: { "80/tcp": 8080 },
				running: false,
			});
		});
	});

	describe("service management", () => {
		test("startService starts a service", () => {
			const mock = getMockState();
			expect(mock.startService("nginx")).toBe(true);
			expect(mock.serviceRunning("nginx")).toBe(true);
		});

		test("startService returns false if already running", () => {
			const mock = getMockState();
			mock.startService("nginx");
			expect(mock.startService("nginx")).toBe(false);
		});

		test("stopService stops a service", () => {
			const mock = getMockState();
			mock.startService("nginx");
			expect(mock.stopService("nginx")).toBe(true);
			expect(mock.serviceRunning("nginx")).toBe(false);
		});

		test("restartService always changes state", () => {
			const mock = getMockState();
			expect(mock.restartService("nginx")).toBe(true);
			expect(mock.serviceRunning("nginx")).toBe(true);
		});

		test("serviceExists returns true after start", () => {
			const mock = getMockState();
			expect(mock.serviceExists("nginx")).toBe(false);
			mock.startService("nginx");
			expect(mock.serviceExists("nginx")).toBe(true);
		});
	});

	describe("file management", () => {
		test("createDirectory creates a directory", () => {
			const mock = getMockState();
			expect(mock.createDirectory("/opt/app")).toBe(true);
			expect(mock.fileExists("/opt/app")).toBe(true);
			expect(mock.isDirectory("/opt/app")).toBe(true);
		});

		test("createDirectory returns false if exists", () => {
			const mock = getMockState();
			mock.createDirectory("/opt/app");
			expect(mock.createDirectory("/opt/app")).toBe(false);
		});

		test("writeFile creates a file", () => {
			const mock = getMockState();
			expect(mock.writeFile("/opt/app.txt", "content", "0644")).toBe(true);
			expect(mock.fileExists("/opt/app.txt")).toBe(true);
			expect(mock.isDirectory("/opt/app.txt")).toBe(false);
		});

		test("writeFile returns false if same content", () => {
			const mock = getMockState();
			mock.writeFile("/opt/app.txt", "content", "0644");
			expect(mock.writeFile("/opt/app.txt", "content", "0644")).toBe(false);
		});

		test("removeFile removes file", () => {
			const mock = getMockState();
			mock.writeFile("/opt/app.txt", "content");
			expect(mock.removeFile("/opt/app.txt")).toBe(true);
			expect(mock.fileExists("/opt/app.txt")).toBe(false);
		});
	});

	describe("line-in-file management", () => {
		test("addLine adds a line to file", () => {
			const mock = getMockState();
			expect(mock.addLine("/etc/hosts", "127.0.0.1 test")).toBe(true);
			expect(mock.hasLine("/etc/hosts", "127.0.0.1 test")).toBe(true);
		});

		test("addLine returns false if line exists", () => {
			const mock = getMockState();
			mock.addLine("/etc/hosts", "127.0.0.1 test");
			expect(mock.addLine("/etc/hosts", "127.0.0.1 test")).toBe(false);
		});

		test("removeLine removes a line", () => {
			const mock = getMockState();
			mock.addLine("/etc/hosts", "127.0.0.1 test");
			expect(mock.removeLine("/etc/hosts", "127.0.0.1 test")).toBe(true);
			expect(mock.hasLine("/etc/hosts", "127.0.0.1 test")).toBe(false);
		});

		test("getLines returns all lines", () => {
			const mock = getMockState();
			mock.addLine("/etc/hosts", "127.0.0.1 a");
			mock.addLine("/etc/hosts", "127.0.0.1 b");
			expect(mock.getLines("/etc/hosts")).toContain("127.0.0.1 a");
			expect(mock.getLines("/etc/hosts")).toContain("127.0.0.1 b");
		});
	});

	describe("reverse proxy management", () => {
		test("addReverseProxy adds config", () => {
			const mock = getMockState();
			expect(mock.addReverseProxy("test.local", "http://localhost:8080")).toBe(true);
			expect(mock.reverseProxyExists("test.local")).toBe(true);
		});

		test("removeReverseProxy removes config", () => {
			const mock = getMockState();
			mock.addReverseProxy("test.local", "http://localhost:8080");
			expect(mock.removeReverseProxy("test.local")).toBe(true);
			expect(mock.reverseProxyExists("test.local")).toBe(false);
		});
	});

	describe("git repo management", () => {
		test("cloneRepo tracks repository", () => {
			const mock = getMockState();
			expect(mock.cloneRepo("https://github.com/test/repo", "/opt/repo")).toBe(true);
			expect(mock.repoExists("/opt/repo")).toBe(true);
			expect(mock.fileExists("/opt/repo")).toBe(true);
		});

		test("cloneRepo returns false if exists", () => {
			const mock = getMockState();
			mock.cloneRepo("https://github.com/test/repo", "/opt/repo");
			expect(mock.cloneRepo("https://github.com/test/repo", "/opt/repo")).toBe(false);
		});
	});

	describe("reset", () => {
		test("reset clears all state", () => {
			const mock = getMockState();
			mock.createContainer("test", "nginx", {});
			mock.startService("nginx");
			mock.createDirectory("/opt/app");
			mock.addLine("/etc/hosts", "test");
			mock.addReverseProxy("test.local", "http://localhost");
			mock.cloneRepo("https://github.com/test", "/opt/repo");

			mock.reset();

			expect(mock.containerExists("test")).toBe(false);
			expect(mock.serviceExists("nginx")).toBe(false);
			expect(mock.fileExists("/opt/app")).toBe(false);
			expect(mock.hasLine("/etc/hosts", "test")).toBe(false);
			expect(mock.reverseProxyExists("test.local")).toBe(false);
			expect(mock.repoExists("/opt/repo")).toBe(false);
		});
	});

	describe("isMockMode", () => {
		test("returns false when KATANA_MOCK is not set", () => {
			const original = process.env.KATANA_MOCK;
			delete process.env.KATANA_MOCK;
			expect(isMockMode()).toBe(false);
			process.env.KATANA_MOCK = original;
		});

		test("returns true when KATANA_MOCK is 'true'", () => {
			const original = process.env.KATANA_MOCK;
			process.env.KATANA_MOCK = "true";
			expect(isMockMode()).toBe(true);
			process.env.KATANA_MOCK = original;
		});
	});
});
