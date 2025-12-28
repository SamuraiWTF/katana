import type { LoadedModule } from "./module-loader";

// =============================================================================
// Types
// =============================================================================

/**
 * Dependency graph structure
 */
export interface DependencyGraph {
	/** Map of module name -> array of dependency module names */
	edges: Map<string, string[]>;
	/** All module names in the graph */
	nodes: Set<string>;
}

/**
 * Error information for dependency resolution failures
 */
export interface DependencyError {
	type: "circular" | "missing";
	message: string;
	details: {
		module: string;
		chain?: string[]; // For circular: the cycle path
		missing?: string; // For missing: the missing dependency
	};
}

/**
 * Result of dependency resolution
 */
export interface ResolutionResult {
	success: boolean;
	/** Modules in installation order (topologically sorted) */
	order: string[];
	errors: DependencyError[];
}

// =============================================================================
// DependencyResolver Class
// =============================================================================

/**
 * Resolves module dependencies using graph algorithms.
 *
 * Features:
 * - Build dependency graph from module definitions
 * - Detect circular dependencies using DFS with 3-color marking
 * - Topological sort for installation order using Kahn's algorithm
 * - Find reverse dependencies (modules that depend on a given module)
 */
export class DependencyResolver {
	private modules: Map<string, LoadedModule>;
	private graph: DependencyGraph;

	constructor(modules: LoadedModule[]) {
		this.modules = new Map();
		for (const mod of modules) {
			this.modules.set(mod.name.toLowerCase(), mod);
		}
		this.graph = this.buildGraph();
	}

	/**
	 * Build dependency graph from all modules
	 */
	buildGraph(): DependencyGraph {
		const edges = new Map<string, string[]>();
		const nodes = new Set<string>();

		for (const module of this.modules.values()) {
			const moduleName = module.name.toLowerCase();
			nodes.add(moduleName);

			const deps = module["depends-on"] ?? [];
			const normalizedDeps = deps.map((d) => d.toLowerCase());
			edges.set(moduleName, normalizedDeps);

			// Add dependency nodes (even if module not loaded)
			for (const dep of normalizedDeps) {
				nodes.add(dep);
			}
		}

		return { edges, nodes };
	}

	/**
	 * Detect circular dependencies using DFS with 3-color marking.
	 *
	 * Colors: WHITE (0) = unvisited, GRAY (1) = in current path, BLACK (2) = done
	 * A cycle exists when we encounter a GRAY node.
	 */
	detectCircularDependencies(): DependencyError[] {
		const WHITE = 0;
		const GRAY = 1;
		const BLACK = 2;

		const color = new Map<string, number>();
		const errors: DependencyError[] = [];

		// Initialize all nodes as WHITE
		for (const node of this.graph.nodes) {
			color.set(node, WHITE);
		}

		const dfs = (node: string, path: string[]): void => {
			color.set(node, GRAY);

			const deps = this.graph.edges.get(node) ?? [];
			for (const dep of deps) {
				if (color.get(dep) === GRAY) {
					// Found cycle - extract the cycle path
					const cycleStart = path.indexOf(dep);
					const cycle = cycleStart >= 0 ? [...path.slice(cycleStart), dep] : [node, dep];

					errors.push({
						type: "circular",
						message: `Circular dependency detected: ${cycle.join(" -> ")}`,
						details: {
							module: node,
							chain: cycle,
						},
					});
				} else if (color.get(dep) === WHITE) {
					dfs(dep, [...path, dep]);
				}
			}

			color.set(node, BLACK);
		};

		// Run DFS from each unvisited node
		for (const node of this.graph.nodes) {
			if (color.get(node) === WHITE) {
				dfs(node, [node]);
			}
		}

		return errors;
	}

	/**
	 * Validate that all dependencies reference existing modules
	 */
	validateDependencies(): DependencyError[] {
		const errors: DependencyError[] = [];

		for (const [moduleName, deps] of this.graph.edges) {
			for (const dep of deps) {
				if (!this.modules.has(dep)) {
					errors.push({
						type: "missing",
						message: `Module '${moduleName}' depends on '${dep}' which does not exist`,
						details: {
							module: moduleName,
							missing: dep,
						},
					});
				}
			}
		}

		return errors;
	}

	/**
	 * Get all transitive dependencies of a module (not including the module itself)
	 */
	private getTransitiveDependencies(moduleName: string): Set<string> {
		const result = new Set<string>();
		const visited = new Set<string>();
		const normalizedName = moduleName.toLowerCase();

		const visit = (name: string): void => {
			if (visited.has(name)) return;
			visited.add(name);

			const deps = this.graph.edges.get(name) ?? [];
			for (const dep of deps) {
				result.add(dep);
				visit(dep);
			}
		};

		visit(normalizedName);
		return result;
	}

	/**
	 * Get topologically sorted installation order for a target module.
	 * Uses Kahn's algorithm (BFS with in-degree tracking).
	 *
	 * The returned order includes all dependencies plus the target module,
	 * with dependencies coming before modules that depend on them.
	 */
	getInstallOrder(targetModule: string): ResolutionResult {
		const normalizedTarget = targetModule.toLowerCase();

		// Check if target exists
		if (!this.modules.has(normalizedTarget)) {
			return {
				success: false,
				order: [],
				errors: [
					{
						type: "missing",
						message: `Module '${targetModule}' not found`,
						details: {
							module: targetModule,
							missing: targetModule,
						},
					},
				],
			};
		}

		// Get all modules needed (target + its transitive deps)
		const needed = this.getTransitiveDependencies(normalizedTarget);
		needed.add(normalizedTarget);

		// Validate all needed modules exist
		const missingErrors: DependencyError[] = [];
		for (const name of needed) {
			if (!this.modules.has(name)) {
				const dependedBy = this.findWhoNeeds(name, needed);
				missingErrors.push({
					type: "missing",
					message: `Module '${dependedBy}' depends on '${name}' which does not exist`,
					details: {
						module: dependedBy,
						missing: name,
					},
				});
			}
		}

		if (missingErrors.length > 0) {
			return {
				success: false,
				order: [],
				errors: missingErrors,
			};
		}

		// Check for circular dependencies in the needed subset
		const circularErrors = this.detectCircularDependenciesInSubset(needed);
		if (circularErrors.length > 0) {
			return {
				success: false,
				order: [],
				errors: circularErrors,
			};
		}

		// Kahn's algorithm for topological sort
		// Calculate in-degree for each node (within the needed subset)
		const inDegree = new Map<string, number>();
		for (const node of needed) {
			inDegree.set(node, 0);
		}

		// For each needed node, count how many of its dependencies are also needed
		for (const node of needed) {
			const deps = this.graph.edges.get(node) ?? [];
			for (const dep of deps) {
				if (needed.has(dep)) {
					// This node depends on dep, so dep should come first
					// We count how many things depend ON each node
					inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
				}
			}
		}

		// Start with nodes that have no dependencies (in-degree = 0)
		const queue: string[] = [];
		for (const [node, degree] of inDegree) {
			if (degree === 0) {
				queue.push(node);
			}
		}

		const order: string[] = [];
		while (queue.length > 0) {
			const node = queue.shift()!;
			order.push(node);

			// For each module that depends on this node, decrement its in-degree
			for (const other of needed) {
				const deps = this.graph.edges.get(other) ?? [];
				if (deps.includes(node)) {
					const newDegree = (inDegree.get(other) ?? 1) - 1;
					inDegree.set(other, newDegree);
					if (newDegree === 0) {
						queue.push(other);
					}
				}
			}
		}

		// If we didn't process all nodes, there's a cycle (shouldn't happen after check)
		if (order.length !== needed.size) {
			return {
				success: false,
				order: [],
				errors: [
					{
						type: "circular",
						message: "Unexpected cycle detected during topological sort",
						details: { module: normalizedTarget },
					},
				],
			};
		}

		return {
			success: true,
			order,
			errors: [],
		};
	}

	/**
	 * Find which module in the needed set requires the given dependency
	 */
	private findWhoNeeds(dep: string, needed: Set<string>): string {
		for (const mod of needed) {
			const deps = this.graph.edges.get(mod) ?? [];
			if (deps.includes(dep)) {
				return mod;
			}
		}
		return "unknown";
	}

	/**
	 * Detect circular dependencies within a subset of nodes
	 */
	private detectCircularDependenciesInSubset(subset: Set<string>): DependencyError[] {
		const WHITE = 0;
		const GRAY = 1;
		const BLACK = 2;

		const color = new Map<string, number>();
		const errors: DependencyError[] = [];

		for (const node of subset) {
			color.set(node, WHITE);
		}

		const dfs = (node: string, path: string[]): void => {
			color.set(node, GRAY);

			const deps = this.graph.edges.get(node) ?? [];
			for (const dep of deps) {
				if (!subset.has(dep)) continue; // Only check within subset

				if (color.get(dep) === GRAY) {
					const cycleStart = path.indexOf(dep);
					const cycle = cycleStart >= 0 ? [...path.slice(cycleStart), dep] : [node, dep];
					errors.push({
						type: "circular",
						message: `Circular dependency detected: ${cycle.join(" -> ")}`,
						details: { module: node, chain: cycle },
					});
				} else if (color.get(dep) === WHITE) {
					dfs(dep, [...path, dep]);
				}
			}

			color.set(node, BLACK);
		};

		for (const node of subset) {
			if (color.get(node) === WHITE) {
				dfs(node, [node]);
			}
		}

		return errors;
	}

	/**
	 * Get all modules that depend on the given module (reverse lookup).
	 * Useful for warning when removing a module that others depend on.
	 */
	getDependents(moduleName: string): string[] {
		const normalizedName = moduleName.toLowerCase();
		const dependents: string[] = [];

		for (const [modName, deps] of this.graph.edges) {
			if (deps.includes(normalizedName)) {
				dependents.push(modName);
			}
		}

		return dependents;
	}

	/**
	 * Check if a module has any dependencies
	 */
	hasDependencies(moduleName: string): boolean {
		const deps = this.graph.edges.get(moduleName.toLowerCase());
		return deps !== undefined && deps.length > 0;
	}

	/**
	 * Get direct dependencies of a module
	 */
	getDependencies(moduleName: string): string[] {
		return this.graph.edges.get(moduleName.toLowerCase()) ?? [];
	}
}
