import type { Command } from "commander";
import { getCertManager } from "../core/cert-manager.ts";
import { KatanaError } from "../types/errors.ts";
import { logger } from "../utils/logger.ts";
import { resolvePath } from "../utils/paths.ts";

/**
 * Register certificate management commands
 */
export function registerCertCommands(program: Command): void {
  const cert = program.command("cert").description("Certificate management commands");

  // katana cert init
  cert
    .command("init")
    .description("Initialize CA and generate server certificates")
    .action(async () => {
      try {
        const certManager = getCertManager();

        const isInit = await certManager.isInitialized();
        if (isInit) {
          logger.info("CA already exists, regenerating server certificate...");
        } else {
          logger.info("Initializing Certificate Authority...");
        }

        await certManager.initCA();

        const days = await certManager.daysUntilExpiration();
        logger.success("Certificates initialized successfully");
        logger.info(`Server certificate expires in ${days} days`);
        logger.info("");
        logger.info("To trust the CA in your browser:");
        logger.info("  katana cert export");
        logger.info("  Then import ca.crt into your browser's certificate store");
      } catch (error) {
        handleError(error);
      }
    });

  // katana cert renew
  cert
    .command("renew")
    .description("Renew server certificate (keeps existing CA)")
    .action(async () => {
      try {
        const certManager = getCertManager();

        if (!(await certManager.isInitialized())) {
          logger.error("CA not initialized. Run 'katana cert init' first.");
          process.exit(1);
        }

        logger.info("Renewing server certificate...");
        await certManager.renewCert();

        const days = await certManager.daysUntilExpiration();
        logger.success("Certificate renewed successfully");
        logger.info(`New certificate expires in ${days} days`);
      } catch (error) {
        handleError(error);
      }
    });

  // katana cert export [path]
  cert
    .command("export")
    .argument("[path]", "Destination path", "./ca.crt")
    .description("Export CA certificate for browser import")
    .action(async (path: string) => {
      try {
        const certManager = getCertManager();

        if (!(await certManager.isInitialized())) {
          logger.error("CA not initialized. Run 'katana cert init' first.");
          process.exit(1);
        }

        const destPath = resolvePath(path);
        await certManager.exportCA(destPath);

        logger.success(`CA certificate exported to: ${destPath}`);
        logger.info("");
        logger.info("Import this certificate into your browser:");
        logger.info(
          "  Firefox: Preferences → Privacy & Security → Certificates → View Certificates → Import",
        );
        logger.info(
          "  Chrome:  Settings → Privacy and security → Security → Manage certificates → Authorities → Import",
        );
      } catch (error) {
        handleError(error);
      }
    });

  // katana cert status
  cert
    .command("status")
    .description("Show certificate status")
    .action(async () => {
      try {
        const certManager = getCertManager();

        console.log("Certificate Status");
        console.log("==================\n");

        const isInit = await certManager.isInitialized();
        if (!isInit) {
          logger.error("CA not initialized");
          logger.info("Run: katana cert init");
          return;
        }

        logger.success("CA initialized");

        const valid = await certManager.validateCerts();
        const days = await certManager.daysUntilExpiration();

        if (valid) {
          logger.success(`Server certificate valid (expires in ${days} days)`);
          if (days < 30) {
            logger.warn("Certificate expires soon! Run: katana cert renew");
          }
        } else {
          logger.error("Server certificate invalid or expired");
          logger.info("Run: katana cert renew");
        }

        console.log(`\nCertificates location: ${certManager.getPath()}`);
      } catch (error) {
        handleError(error);
      }
    });
}

/**
 * Handle errors consistently
 */
function handleError(error: unknown): void {
  if (error instanceof KatanaError) {
    logger.error(error.message);
    if (error.help) {
      console.log(`Help: ${error.help()}`);
    }
    process.exit(1);
  }

  if (error instanceof Error) {
    logger.error(error.message);
    process.exit(1);
  }

  logger.error("An unknown error occurred");
  process.exit(1);
}
