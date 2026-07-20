import YAML from "yaml";
import { StateError } from "../types/errors.ts";
import {
  type State,
  type TargetState,
  type ToolState,
  createEmptyState,
  parseState,
} from "../types/state.ts";
import { ensureParentDir, getStatePath, resolvePath } from "../utils/paths.ts";

/**
 * Manages system state with atomic writes
 */
export class StateManager {
  private statePath: string;
  private state: State | null = null;

  constructor(statePath?: string) {
    this.statePath = resolvePath(statePath ?? getStatePath());
  }

  /**
   * Load state from disk
   * Creates empty state if not exists
   */
  async load(): Promise<State> {
    const file = Bun.file(this.statePath);
    const exists = await file.exists();

    if (!exists) {
      // Create empty state
      const emptyState = createEmptyState();
      await this.save(emptyState);
      this.state = emptyState;
      return this.state;
    }

    try {
      const content = await file.text();
      const data = YAML.parse(content);
      this.state = parseState(data);
      return this.state;
    } catch (error) {
      if (error instanceof Error) {
        throw new StateError(`Failed to load state: ${error.message}`);
      }
      throw new StateError("Failed to load state: Unknown error");
    }
  }

  /**
   * Save state to disk atomically
   * Uses temp file + rename pattern to prevent corruption
   */
  async save(state: State): Promise<void> {
    try {
      await ensureParentDir(this.statePath);

      // Update timestamp
      state.last_updated = new Date().toISOString();

      const content = YAML.stringify(state);
      const tempPath = `${this.statePath}.tmp`;

      // Write to temp file first
      await Bun.write(tempPath, content);

      // Atomic rename
      await Bun.spawn(["mv", tempPath, this.statePath]).exited;

      this.state = state;
    } catch (error) {
      if (error instanceof Error) {
        throw new StateError(`Failed to save state: ${error.message}`);
      }
      throw new StateError("Failed to save state: Unknown error");
    }
  }

  /**
   * Get current state
   * Always reloads from disk to see changes from other processes (CLI + proxy)
   */
  async get(): Promise<State> {
    return this.load();
  }

  /**
   * Update state with a modifier function
   * Handles get -> modify -> save pattern
   */
  async update(fn: (state: State) => State | Promise<State>): Promise<void> {
    const currentState = await this.get();
    const newState = await fn(currentState);
    await this.save(newState);
  }

  /**
   * Check if system is locked
   */
  async isLocked(): Promise<boolean> {
    const state = await this.get();
    return state.locked;
  }

  /**
   * Set lock status
   */
  async setLocked(locked: boolean): Promise<void> {
    await this.update((state) => ({
      ...state,
      locked,
    }));
  }

  /**
   * Add installed target to state
   */
  async addTarget(target: TargetState): Promise<void> {
    await this.update((state) => ({
      ...state,
      targets: [...state.targets, target],
    }));
  }

  /**
   * Remove target from state
   */
  async removeTarget(name: string): Promise<void> {
    await this.update((state) => ({
      ...state,
      targets: state.targets.filter((t) => t.name !== name),
    }));
  }

  /**
   * Find target in state by name
   */
  async findTarget(name: string): Promise<TargetState | undefined> {
    const state = await this.get();
    return state.targets.find((t) => t.name === name);
  }

  /**
   * Add installed tool to state
   */
  async addTool(tool: ToolState): Promise<void> {
    await this.update((state) => ({
      ...state,
      tools: [...state.tools, tool],
    }));
  }

  /**
   * Remove tool from state
   */
  async removeTool(name: string): Promise<void> {
    await this.update((state) => ({
      ...state,
      tools: state.tools.filter((t) => t.name !== name),
    }));
  }

  /**
   * Find tool in state by name
   */
  async findTool(name: string): Promise<ToolState | undefined> {
    const state = await this.get();
    return state.tools.find((t) => t.name === name);
  }

  /**
   * Get the state file path
   */
  getPath(): string {
    return this.statePath;
  }
}

// Default singleton instance
let defaultInstance: StateManager | null = null;

/**
 * Get the default StateManager instance
 */
export function getStateManager(): StateManager {
  if (defaultInstance === null) {
    defaultInstance = new StateManager();
  }
  return defaultInstance;
}
