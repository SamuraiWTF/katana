import { join } from "node:path";
import { ModuleError } from "../types/errors.ts";
import type { ToolModule } from "../types/module.ts";
import { logger } from "../utils/logger.ts";

/**
 * Result of a tool installation
 */
export interface InstallResult {
  version?: string;
}

/**
 * Manages tool script execution (install/remove)
 */
export class ToolExecutor {
  /**
   * Execute the install script for a tool module
   */
  async executeInstall(module: ToolModule): Promise<InstallResult> {
    if (!module.path) {
      throw new ModuleError("Module path not set", module.name);
    }

    const scriptPath = join(module.path, module.install);

    // Check if script exists and is executable
    await this.validateScript(scriptPath, "install");

    logger.info(`Running install script: ${scriptPath}`);

    // Execute the script
    const output = await this.executeScript(scriptPath, module.install_requires_root);

    // Parse version from output (looking for TOOL_VERSION=xxx pattern)
    const version = this.parseVersion(output);

    return { version };
  }

  /**
   * Execute the remove script for a tool module
   */
  async executeRemove(module: ToolModule): Promise<void> {
    if (!module.path) {
      throw new ModuleError("Module path not set", module.name);
    }

    const scriptPath = join(module.path, module.remove);

    // Check if script exists and is executable
    await this.validateScript(scriptPath, "remove");

    logger.info(`Running remove script: ${scriptPath}`);

    // Execute the script
    await this.executeScript(scriptPath, module.install_requires_root);
  }

  /**
   * Validate that a script exists and is executable
   */
  private async validateScript(scriptPath: string, scriptType: string): Promise<void> {
    const file = Bun.file(scriptPath);

    if (!(await file.exists())) {
      throw new ModuleError(`${scriptType} script not found: ${scriptPath}`);
    }

    // Check if file is executable (Unix permissions)
    // Note: Bun.file doesn't expose permissions, so we'll rely on the shell execution to fail if not executable
  }

  /**
   * Execute a script with appropriate permissions
   */
  private async executeScript(scriptPath: string, requiresRoot: boolean): Promise<string> {
    const command = requiresRoot ? ["sudo", "bash", scriptPath] : ["bash", scriptPath];

    const proc = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Capture output
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    // Log stderr if present (warnings, informational messages)
    if (stderr.trim()) {
      // Split by lines and log each
      for (const line of stderr.trim().split("\n")) {
        logger.info(`  ${line}`);
      }
    }

    // Log stdout (install progress messages)
    if (stdout.trim()) {
      for (const line of stdout.trim().split("\n")) {
        // Skip version output lines (we parse those separately)
        if (!line.startsWith("TOOL_VERSION=")) {
          logger.info(`  ${line}`);
        }
      }
    }

    // Check exit code
    if (exitCode !== 0) {
      throw new ModuleError(
        `Script execution failed with exit code ${exitCode}\nStderr: ${stderr}\nStdout: ${stdout}`,
      );
    }

    return stdout;
  }

  /**
   * Parse version from script output
   * Looks for lines like: TOOL_VERSION=v2.1.0
   */
  private parseVersion(output: string): string | undefined {
    const lines = output.split("\n");
    for (const line of lines) {
      const match = line.match(/^TOOL_VERSION=(.+)$/);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return undefined;
  }
}

/**
 * Singleton instance
 */
let toolExecutorInstance: ToolExecutor | null = null;

/**
 * Get the ToolExecutor singleton
 */
export function getToolExecutor(): ToolExecutor {
  if (!toolExecutorInstance) {
    toolExecutorInstance = new ToolExecutor();
  }
  return toolExecutorInstance;
}
