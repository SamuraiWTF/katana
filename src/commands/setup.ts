import type { Command } from "commander";
import { handleError } from "../cli.ts";
import { logger } from "../utils/logger.ts";

/**
 * Register setup commands
 */
export function registerSetupCommands(program: Command): void {
  program
    .command("setup-proxy")
    .description("Configure system for proxy operation (requires sudo)")
    .action(async () => {
      try {
        await setupProxy();
      } catch (error) {
        handleError(error);
      }
    });
}

/**
 * Set up proxy capabilities
 */
async function setupProxy(): Promise<void> {
  console.log("Setting up proxy capabilities...");
  console.log("");

  // Try to get the actual binary path
  // When running under sudo, process.argv[1] can be unreliable (e.g., Bun's virtual FS path)
  let katanaPath = "katana";

  try {
    // 1. First try: Check if katana is in PATH
    const whichProc = Bun.spawn(["which", "katana"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const whichExit = await whichProc.exited;
    const whichOutput = await new Response(whichProc.stdout).text();

    if (whichExit === 0 && whichOutput.trim()) {
      katanaPath = whichOutput.trim();
    } else if (process.env.SUDO_USER) {
      // 2. Fallback for sudo: Try common locations based on original user
      const sudoUser = process.env.SUDO_USER;
      const possiblePaths = [
        `${process.cwd()}/katana`, // If run from bin/ directory
        `${process.cwd()}/bin/katana`, // If run from project root
        `/home/${sudoUser}/projects/katana/bin/katana`, // Common dev path
        `/home/${sudoUser}/bin/katana`, // User's bin directory
      ];

      for (const path of possiblePaths) {
        const file = Bun.file(path);
        if (await file.exists()) {
          katanaPath = path;
          break;
        }
      }
    }
  } catch {
    // Fall back to "katana" if resolution fails
  }

  // Check if setcap is available
  const setcapProc = Bun.spawn(["which", "setcap"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const setcapExit = await setcapProc.exited;

  if (setcapExit !== 0) {
    logger.error("setcap command not found.");
    logger.error("");
    logger.error("Install it with:");
    logger.error("  sudo apt install libcap2-bin");
    process.exit(1);
  }

  // Output the command for the user to run
  const setcapCommand = `sudo setcap cap_net_bind_service=+ep ${katanaPath}`;

  console.log("To allow Katana to bind to port 443 without sudo, run:");
  console.log("");
  console.log(`  ${setcapCommand}`);
  console.log("");
  console.log("After running this command, you can start the proxy without sudo:");
  console.log("  katana proxy start");
  console.log("");
  console.log("Note: If you move the katana binary, you'll need to run setcap again.");
  console.log("");

  // If running as root, offer to apply it now
  if (process.getuid?.() === 0) {
    console.log("Detected root privileges. Applying capability now...");
    console.log("");

    const proc = Bun.spawn(["setcap", "cap_net_bind_service=+ep", katanaPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      logger.error("Failed to set capabilities:", stderr.trim());
      logger.error("");
      logger.error("You may need to run the command manually with the correct path.");
      process.exit(1);
    }

    logger.success("Successfully configured port binding capability!");
  }
}
