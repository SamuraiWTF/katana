/**
 * Plugin registry for discovering and managing task plugins.
 * Provides dynamic plugin registration and lookup by alias.
 */

import type { IPlugin } from "../types/plugin";

// =============================================================================
// PluginRegistry Class
// =============================================================================

/**
 * Registry for task plugins. Manages plugin registration and lookup.
 */
export class PluginRegistry {
	private plugins: Map<string, IPlugin> = new Map();

	private static instance: PluginRegistry | null = null;

	/**
	 * Get or create the singleton instance
	 */
	static getInstance(): PluginRegistry {
		if (!PluginRegistry.instance) {
			PluginRegistry.instance = new PluginRegistry();
		}
		return PluginRegistry.instance;
	}

	/**
	 * Reset singleton (useful for testing)
	 */
	static resetInstance(): void {
		PluginRegistry.instance = null;
	}

	/**
	 * Register a plugin by alias (e.g., "docker", "service")
	 */
	register(alias: string, plugin: IPlugin): void {
		this.plugins.set(alias, plugin);
	}

	/**
	 * Get a plugin by alias
	 */
	get(alias: string): IPlugin | undefined {
		return this.plugins.get(alias);
	}

	/**
	 * Check if a plugin is registered
	 */
	has(alias: string): boolean {
		return this.plugins.has(alias);
	}

	/**
	 * Get all registered plugins
	 */
	getAll(): Map<string, IPlugin> {
		return new Map(this.plugins);
	}

	/**
	 * Get list of registered plugin aliases
	 */
	getAliases(): string[] {
		return Array.from(this.plugins.keys());
	}

	/**
	 * Clear all registered plugins (useful for testing)
	 */
	clear(): void {
		this.plugins.clear();
	}

	/**
	 * Load and register all built-in plugins.
	 * Uses dynamic imports for better tree-shaking.
	 */
	async loadBuiltinPlugins(): Promise<void> {
		// Import all plugin modules dynamically
		const [
			{ DockerPlugin },
			{ ServicePlugin },
			{ LineinfilePlugin },
			{ ReverseproxyPlugin },
			{ FilePlugin },
			{ CopyPlugin },
			{ GitPlugin },
			{ CommandPlugin },
			{ RmPlugin },
			{ GetUrlPlugin },
			{ UnarchivePlugin },
			{ ReplacePlugin },
			{ DesktopPlugin },
		] = await Promise.all([
			import("./docker"),
			import("./service"),
			import("./lineinfile"),
			import("./reverseproxy"),
			import("./file"),
			import("./copy"),
			import("./git"),
			import("./command"),
			import("./rm"),
			import("./get-url"),
			import("./unarchive"),
			import("./replace"),
			import("./desktop"),
		]);

		// Register each plugin with its alias
		this.register("docker", new DockerPlugin());
		this.register("service", new ServicePlugin());
		this.register("lineinfile", new LineinfilePlugin());
		this.register("reverseproxy", new ReverseproxyPlugin());
		this.register("file", new FilePlugin());
		this.register("copy", new CopyPlugin());
		this.register("git", new GitPlugin());
		this.register("command", new CommandPlugin());
		this.register("rm", new RmPlugin());
		this.register("get_url", new GetUrlPlugin());
		this.register("unarchive", new UnarchivePlugin());
		this.register("replace", new ReplacePlugin());
		this.register("desktop", new DesktopPlugin());
	}
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get the singleton PluginRegistry instance
 */
export function getPluginRegistry(): PluginRegistry {
	return PluginRegistry.getInstance();
}
