/**
 * Mock state management for testing plugins without Docker/systemd.
 * Used when KATANA_MOCK=true environment variable is set.
 */

// =============================================================================
// Types
// =============================================================================

export interface MockContainerState {
	name: string;
	image: string;
	ports: Record<string, number>;
	running: boolean;
}

export interface MockServiceState {
	name: string;
	running: boolean;
}

export interface MockFileState {
	path: string;
	type: "directory" | "file";
	content?: string;
	mode?: string;
}

// =============================================================================
// MockState Class
// =============================================================================

/**
 * In-memory state tracker for mock mode testing.
 * Simulates Docker containers, systemd services, files, and line-in-file operations.
 */
export class MockState {
	private containers: Map<string, MockContainerState> = new Map();
	private services: Map<string, MockServiceState> = new Map();
	private files: Map<string, MockFileState> = new Map();
	private fileLines: Map<string, Set<string>> = new Map();

	private static instance: MockState | null = null;

	/**
	 * Get or create the singleton instance
	 */
	static getInstance(): MockState {
		if (!MockState.instance) {
			MockState.instance = new MockState();
		}
		return MockState.instance;
	}

	/**
	 * Reset singleton (useful for testing)
	 */
	static resetInstance(): void {
		MockState.instance = null;
	}

	/**
	 * Reset all state (useful between tests)
	 */
	reset(): void {
		this.containers.clear();
		this.services.clear();
		this.files.clear();
		this.fileLines.clear();
		this.reverseProxies.clear();
		this.gitRepos.clear();
	}

	// =========================================================================
	// Container Management
	// =========================================================================

	/**
	 * Create a container (but don't start it)
	 */
	createContainer(
		name: string,
		image: string,
		ports: Record<string, number> = {},
	): void {
		this.containers.set(name, {
			name,
			image,
			ports,
			running: false,
		});
	}

	/**
	 * Start a container. Returns true if state changed.
	 */
	startContainer(name: string): boolean {
		const container = this.containers.get(name);
		if (!container) {
			return false;
		}
		if (container.running) {
			return false;
		}
		container.running = true;
		return true;
	}

	/**
	 * Stop a container. Returns true if state changed.
	 */
	stopContainer(name: string): boolean {
		const container = this.containers.get(name);
		if (!container) {
			return false;
		}
		if (!container.running) {
			return false;
		}
		container.running = false;
		return true;
	}

	/**
	 * Remove a container. Returns true if it existed.
	 */
	removeContainer(name: string): boolean {
		return this.containers.delete(name);
	}

	/**
	 * Check if a container exists
	 */
	containerExists(name: string): boolean {
		return this.containers.has(name);
	}

	/**
	 * Check if a container is running
	 */
	containerRunning(name: string): boolean {
		const container = this.containers.get(name);
		return container?.running ?? false;
	}

	/**
	 * Get container state
	 */
	getContainer(name: string): MockContainerState | undefined {
		return this.containers.get(name);
	}

	// =========================================================================
	// Service Management
	// =========================================================================

	/**
	 * Start a service
	 */
	startService(name: string): boolean {
		const existing = this.services.get(name);
		if (existing?.running) {
			return false;
		}
		this.services.set(name, { name, running: true });
		return true;
	}

	/**
	 * Stop a service
	 */
	stopService(name: string): boolean {
		const existing = this.services.get(name);
		if (!existing?.running) {
			return false;
		}
		existing.running = false;
		return true;
	}

	/**
	 * Restart a service (always returns true for changed)
	 */
	restartService(name: string): boolean {
		this.services.set(name, { name, running: true });
		return true;
	}

	/**
	 * Check if a service is running
	 */
	serviceRunning(name: string): boolean {
		return this.services.get(name)?.running ?? false;
	}

	/**
	 * Check if a service exists (has been started at least once)
	 */
	serviceExists(name: string): boolean {
		return this.services.has(name);
	}

	// =========================================================================
	// File Management
	// =========================================================================

	/**
	 * Create a directory
	 */
	createDirectory(path: string): boolean {
		if (this.files.has(path)) {
			return false;
		}
		this.files.set(path, { path, type: "directory" });
		return true;
	}

	/**
	 * Write a file
	 */
	writeFile(path: string, content: string, mode?: string): boolean {
		const existing = this.files.get(path);
		if (existing?.type === "file" && existing.content === content && existing.mode === mode) {
			return false;
		}
		this.files.set(path, { path, type: "file", content, mode });
		return true;
	}

	/**
	 * Remove a file or directory
	 */
	removeFile(path: string): boolean {
		return this.files.delete(path);
	}

	/**
	 * Check if a file or directory exists
	 */
	fileExists(path: string): boolean {
		return this.files.has(path);
	}

	/**
	 * Check if path is a directory
	 */
	isDirectory(path: string): boolean {
		return this.files.get(path)?.type === "directory";
	}

	/**
	 * Get file state
	 */
	getFile(path: string): MockFileState | undefined {
		return this.files.get(path);
	}

	// =========================================================================
	// Line-in-File Management
	// =========================================================================

	/**
	 * Add a line to a file. Returns true if line was added.
	 */
	addLine(path: string, line: string): boolean {
		let lines = this.fileLines.get(path);
		if (!lines) {
			lines = new Set();
			this.fileLines.set(path, lines);
		}
		if (lines.has(line)) {
			return false;
		}
		lines.add(line);
		return true;
	}

	/**
	 * Remove a line from a file. Returns true if line was removed.
	 */
	removeLine(path: string, line: string): boolean {
		const lines = this.fileLines.get(path);
		if (!lines) {
			return false;
		}
		return lines.delete(line);
	}

	/**
	 * Check if a file contains a specific line
	 */
	hasLine(path: string, line: string): boolean {
		const lines = this.fileLines.get(path);
		return lines?.has(line) ?? false;
	}

	/**
	 * Get all lines in a file
	 */
	getLines(path: string): string[] {
		const lines = this.fileLines.get(path);
		return lines ? Array.from(lines) : [];
	}

	// =========================================================================
	// Reverse Proxy Management (nginx configs)
	// =========================================================================

	private reverseProxies: Map<string, { hostname: string; proxyPass?: string }> =
		new Map();

	/**
	 * Add a reverse proxy config
	 */
	addReverseProxy(hostname: string, proxyPass?: string): boolean {
		if (this.reverseProxies.has(hostname)) {
			return false;
		}
		this.reverseProxies.set(hostname, { hostname, proxyPass });
		return true;
	}

	/**
	 * Remove a reverse proxy config
	 */
	removeReverseProxy(hostname: string): boolean {
		return this.reverseProxies.delete(hostname);
	}

	/**
	 * Check if reverse proxy exists
	 */
	reverseProxyExists(hostname: string): boolean {
		return this.reverseProxies.has(hostname);
	}

	// =========================================================================
	// Git Repository Management
	// =========================================================================

	private gitRepos: Map<string, { repo: string; dest: string }> = new Map();

	/**
	 * Clone a git repository
	 */
	cloneRepo(repo: string, dest: string): boolean {
		if (this.gitRepos.has(dest)) {
			return false;
		}
		this.gitRepos.set(dest, { repo, dest });
		// Also mark the destination as a directory
		this.createDirectory(dest);
		return true;
	}

	/**
	 * Check if a git repo exists at destination
	 */
	repoExists(dest: string): boolean {
		return this.gitRepos.has(dest);
	}
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get the singleton MockState instance
 */
export function getMockState(): MockState {
	return MockState.getInstance();
}

/**
 * Check if mock mode is enabled
 */
export function isMockMode(): boolean {
	return process.env.KATANA_MOCK === "true";
}
