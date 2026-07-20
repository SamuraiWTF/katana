import { join } from "node:path";
import YAML from "yaml";
import { CertError, CertNotInitializedError, OpenSSLNotFoundError } from "../types/errors.ts";
import { ensureDir, getCertsPath, resolvePath } from "../utils/paths.ts";
import { getConfigManager } from "./config-manager.ts";

/**
 * Certificate metadata stored alongside certs
 */
interface CertMetadata {
  created_at: string;
  domain: string;
  ca_expires_at: string;
  server_expires_at: string;
}

/**
 * Manages self-signed CA and server certificates
 */
export class CertManager {
  private certsPath: string;
  private metadata: CertMetadata | null = null;

  constructor(certsPath?: string) {
    this.certsPath = resolvePath(certsPath ?? getCertsPath());
  }

  // File paths
  private get caKeyPath(): string {
    return join(this.certsPath, "ca.key");
  }
  private get caCertPath(): string {
    return join(this.certsPath, "ca.crt");
  }
  private get serverKeyPath(): string {
    return join(this.certsPath, "server.key");
  }
  private get serverCertPath(): string {
    return join(this.certsPath, "server.crt");
  }
  private get metadataPath(): string {
    return join(this.certsPath, "cert-metadata.yml");
  }

  /**
   * Get the certificates directory path
   */
  getPath(): string {
    return this.certsPath;
  }

  /**
   * Get the CA certificate file path
   */
  getCACertPath(): string {
    return this.caCertPath;
  }

  /**
   * Check if CA has been initialized
   */
  async isInitialized(): Promise<boolean> {
    const caKeyExists = await Bun.file(this.caKeyPath).exists();
    const caCertExists = await Bun.file(this.caCertPath).exists();
    return caKeyExists && caCertExists;
  }

  /**
   * Initialize CA and generate server certificate
   * Creates CA if not exists, always regenerates server cert for current domain
   */
  async initCA(): Promise<void> {
    await this.checkOpenSSL();
    await ensureDir(this.certsPath);

    const caExists = await this.isInitialized();

    if (!caExists) {
      // Generate CA key (4096-bit for long-lived CA)
      await this.execOpenSSL(["genrsa", "-out", this.caKeyPath, "4096"]);

      // Generate self-signed CA certificate (10 years)
      await this.execOpenSSL([
        "req",
        "-new",
        "-x509",
        "-days",
        "3650",
        "-key",
        this.caKeyPath,
        "-out",
        this.caCertPath,
        "-subj",
        "/CN=Katana CA/O=OWASP SamuraiWTF",
      ]);
    }

    // Generate server cert for current domain
    const domain = await this.getWildcardDomain();
    await this.generateCert(domain);
  }

  /**
   * Generate wildcard server certificate for domain
   */
  async generateCert(domain: string): Promise<void> {
    // Verify CA exists
    if (!(await this.isInitialized())) {
      throw new CertNotInitializedError();
    }

    await this.checkOpenSSL();

    // Generate server key (2048-bit)
    await this.execOpenSSL(["genrsa", "-out", this.serverKeyPath, "2048"]);

    // Create temporary CSR
    const csrPath = join(this.certsPath, "server.csr");
    await this.execOpenSSL([
      "req",
      "-new",
      "-key",
      this.serverKeyPath,
      "-out",
      csrPath,
      "-subj",
      `/CN=${domain}`,
    ]);

    // Create OpenSSL config for SAN extension
    const baseDomain = domain.replace("*.", "");
    const sanConfig = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${domain}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${domain}
DNS.2 = ${baseDomain}
`;

    const sanConfigPath = join(this.certsPath, "san.cnf");
    await Bun.write(sanConfigPath, sanConfig);

    // Sign server cert with CA (1 year validity)
    await this.execOpenSSL([
      "x509",
      "-req",
      "-days",
      "365",
      "-in",
      csrPath,
      "-CA",
      this.caCertPath,
      "-CAkey",
      this.caKeyPath,
      "-CAcreateserial",
      "-out",
      this.serverCertPath,
      "-extfile",
      sanConfigPath,
      "-extensions",
      "v3_req",
    ]);

    // Append CA cert to server cert to create full chain
    // This is required for proper TLS handshake with self-signed CAs
    const serverCert = await Bun.file(this.serverCertPath).text();
    const caCert = await Bun.file(this.caCertPath).text();
    await Bun.write(this.serverCertPath, `${serverCert}${caCert}`);

    // Clean up temp files
    const serialPath = join(this.certsPath, "ca.srl");
    await Bun.spawn(["rm", "-f", csrPath, sanConfigPath, serialPath]).exited;

    // Save metadata
    const now = new Date();
    const caExpires = new Date(now);
    caExpires.setFullYear(caExpires.getFullYear() + 10);

    const serverExpires = new Date(now);
    serverExpires.setFullYear(serverExpires.getFullYear() + 1);

    await this.saveMetadata({
      created_at: now.toISOString(),
      domain,
      ca_expires_at: caExpires.toISOString(),
      server_expires_at: serverExpires.toISOString(),
    });
  }

  /**
   * Check if certificates exist and are valid
   */
  async validateCerts(): Promise<boolean> {
    // Check all required files exist
    const files = [this.caKeyPath, this.caCertPath, this.serverKeyPath, this.serverCertPath];

    for (const file of files) {
      if (!(await Bun.file(file).exists())) {
        return false;
      }
    }

    // Check not expired
    const days = await this.daysUntilExpiration();
    return days > 0;
  }

  /**
   * Get days until server certificate expiration
   * Returns -1 if certs don't exist
   */
  async daysUntilExpiration(): Promise<number> {
    if (!(await Bun.file(this.serverCertPath).exists())) {
      return -1;
    }

    try {
      // Use openssl to get expiration date
      const proc = Bun.spawn(
        ["openssl", "x509", "-enddate", "-noout", "-in", this.serverCertPath],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );

      const stdout = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return -1;
      }

      // Parse: "notAfter=Jan  4 12:00:00 2027 GMT"
      const match = stdout.match(/notAfter=(.+)/);
      if (!match?.[1]) return -1;

      const expiresAt = new Date(match[1].trim());
      const now = new Date();
      const diffMs = expiresAt.getTime() - now.getTime();

      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    } catch {
      return -1;
    }
  }

  /**
   * Export CA certificate to destination path
   */
  async exportCA(destPath: string): Promise<void> {
    if (!(await Bun.file(this.caCertPath).exists())) {
      throw new CertNotInitializedError();
    }

    const resolvedDest = resolvePath(destPath);
    const content = await Bun.file(this.caCertPath).text();
    await Bun.write(resolvedDest, content);
  }

  /**
   * Get TLS options for Bun.serve()
   */
  async getTLSOptions(): Promise<{ cert: string; key: string; ca: string }> {
    if (!(await this.validateCerts())) {
      throw new CertNotInitializedError();
    }

    const [cert, key, ca] = await Promise.all([
      Bun.file(this.serverCertPath).text(),
      Bun.file(this.serverKeyPath).text(),
      Bun.file(this.caCertPath).text(),
    ]);

    return { cert, key, ca };
  }

  /**
   * Renew server certificate (keeps same CA)
   */
  async renewCert(): Promise<void> {
    if (!(await this.isInitialized())) {
      throw new CertNotInitializedError();
    }

    const domain = await this.getWildcardDomain();
    await this.generateCert(domain);
  }

  /**
   * Load metadata from disk
   */
  private async loadMetadata(): Promise<CertMetadata | null> {
    const file = Bun.file(this.metadataPath);
    if (!(await file.exists())) {
      return null;
    }

    try {
      const content = await file.text();
      return YAML.parse(content) as CertMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Save metadata to disk
   */
  private async saveMetadata(metadata: CertMetadata): Promise<void> {
    const content = YAML.stringify(metadata);
    await Bun.write(this.metadataPath, content);
    this.metadata = metadata;
  }

  /**
   * Execute OpenSSL command
   */
  private async execOpenSSL(args: string[]): Promise<void> {
    const proc = Bun.spawn(["openssl", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new CertError(`OpenSSL command failed: ${stderr}`);
    }
  }

  /**
   * Check if OpenSSL is available
   */
  private async checkOpenSSL(): Promise<void> {
    const proc = Bun.spawn(["which", "openssl"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new OpenSSLNotFoundError();
    }
  }

  /**
   * Get wildcard domain from config
   */
  private async getWildcardDomain(): Promise<string> {
    const configManager = getConfigManager();
    const config = await configManager.get();

    if (config.install_type === "remote" && config.base_domain) {
      return `*.${config.base_domain}`;
    }
    return `*.${config.local_domain}`;
  }
}

// Default singleton instance
let defaultInstance: CertManager | null = null;

/**
 * Get the default CertManager instance
 */
export function getCertManager(): CertManager {
  if (defaultInstance === null) {
    defaultInstance = new CertManager();
  }
  return defaultInstance;
}
