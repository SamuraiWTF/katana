import { homedir } from "node:os";
import { join } from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { CERT_FILES, CertStateSchema, type CertPaths, type CertState } from "../types/cert";
import { getMockState, isMockMode } from "./mock-state";

// =============================================================================
// Types
// =============================================================================

export interface CertManagerOptions {
	/** Override state path for testing */
	statePath?: string;
}

export interface InitCertsResult {
	success: boolean;
	message: string;
	certPaths?: CertPaths;
}

export interface InstallCAResult {
	success: boolean;
	message: string;
}

// =============================================================================
// CertManager Class
// =============================================================================

export class CertManager {
	private statePath: string;
	private certState: CertState | null = null;
	private loaded = false;

	private static instance: CertManager | null = null;

	constructor(options?: CertManagerOptions) {
		this.statePath = options?.statePath ?? "/var/lib/katana";
	}

	/**
	 * Get or create the singleton instance
	 */
	static getInstance(options?: CertManagerOptions): CertManager {
		if (!CertManager.instance) {
			CertManager.instance = new CertManager(options);
		}
		return CertManager.instance;
	}

	/**
	 * Reset singleton (useful for testing)
	 */
	static resetInstance(): void {
		CertManager.instance = null;
	}

	/**
	 * Set the state path (called after config is loaded)
	 */
	setStatePath(statePath: string): void {
		this.statePath = this.expandPath(statePath);
		// Reset loaded state so we reload from new path
		this.loaded = false;
		this.certState = null;
	}

	/**
	 * Expand ~ to home directory in path
	 */
	private expandPath(path: string): string {
		if (path.startsWith("~/")) {
			return path.replace("~", homedir());
		}
		return path;
	}

	/**
	 * Get the certs directory path
	 */
	getCertsDir(): string {
		return join(this.statePath, "certs");
	}

	/**
	 * Get paths to all certificate files
	 */
	getCertPaths(): CertPaths {
		const certsDir = this.getCertsDir();
		return {
			cert: join(certsDir, CERT_FILES.WILDCARD_CERT),
			key: join(certsDir, CERT_FILES.WILDCARD_KEY),
			rootCACert: join(certsDir, CERT_FILES.ROOT_CA_CERT),
			rootCAKey: join(certsDir, CERT_FILES.ROOT_CA_KEY),
		};
	}

	/**
	 * Load certificate state from cert-state.yml
	 */
	async loadCertState(): Promise<CertState | null> {
		if (this.loaded) {
			return this.certState;
		}

		// Mock mode
		if (isMockMode()) {
			const mockState = getMockState().getCertState();
			this.certState = mockState
				? {
						initialized: mockState.initialized,
						domainBase: mockState.domainBase,
						createdAt: mockState.createdAt,
					}
				: null;
			this.loaded = true;
			return this.certState;
		}

		const stateFile = join(this.getCertsDir(), CERT_FILES.STATE_FILE);
		const file = Bun.file(stateFile);

		if (!(await file.exists())) {
			this.certState = null;
			this.loaded = true;
			return null;
		}

		try {
			const content = await file.text();
			const parsed = yamlParse(content);
			const result = CertStateSchema.safeParse(parsed);

			if (result.success) {
				this.certState = result.data;
				this.loaded = true;
				return this.certState;
			}

			console.warn("Warning: Invalid cert state file, treating as uninitialized");
			this.certState = null;
			this.loaded = true;
			return null;
		} catch {
			this.certState = null;
			this.loaded = true;
			return null;
		}
	}

	/**
	 * Save certificate state to cert-state.yml
	 */
	private async saveCertState(state: CertState): Promise<void> {
		const stateFile = join(this.getCertsDir(), CERT_FILES.STATE_FILE);
		const content = yamlStringify(state);
		await Bun.write(stateFile, content);
		this.certState = state;
	}

	/**
	 * Check if certificates have been initialized
	 */
	async hasCerts(): Promise<boolean> {
		// Mock mode
		if (isMockMode()) {
			return getMockState().hasCerts();
		}

		const state = await this.loadCertState();
		if (!state?.initialized) {
			return false;
		}

		// Verify the actual cert files exist
		const paths = this.getCertPaths();
		const certFile = Bun.file(paths.cert);
		const keyFile = Bun.file(paths.key);

		return (await certFile.exists()) && (await keyFile.exists());
	}

	/**
	 * Get the current certificate state
	 */
	async getCertState(): Promise<CertState | null> {
		return this.loadCertState();
	}

	/**
	 * Initialize certificates for the given domain base
	 */
	async initCerts(domainBase: string, force = false): Promise<InitCertsResult> {
		// Mock mode
		if (isMockMode()) {
			getMockState().initCerts(domainBase);
			return {
				success: true,
				message: `[mock] Certificates initialized for *.${domainBase}`,
				certPaths: this.getCertPaths(),
			};
		}

		// Check if already initialized
		if (!force && (await this.hasCerts())) {
			const state = await this.loadCertState();
			if (state?.domainBase === domainBase) {
				return {
					success: true,
					message: `Certificates already exist for *.${domainBase}`,
					certPaths: this.getCertPaths(),
				};
			}
			return {
				success: false,
				message: `Certificates exist for *.${state?.domainBase}. Use --force to regenerate for *.${domainBase}`,
			};
		}

		// Check for openssl
		try {
			await Bun.$`which openssl`.quiet();
		} catch {
			return {
				success: false,
				message: "OpenSSL not found. Please install OpenSSL to generate certificates.",
			};
		}

		const certsDir = this.getCertsDir();
		const paths = this.getCertPaths();

		try {
			// Create certs directory
			await Bun.$`mkdir -p ${certsDir}`.quiet();

			// Generate Root CA private key (4096 bit)
			console.log("Generating Root CA private key...");
			await Bun.$`openssl genrsa -out ${paths.rootCAKey} 4096`.quiet();

			// Generate Root CA certificate (10 years)
			console.log("Generating Root CA certificate...");
			await Bun.$`openssl req -x509 -new -nodes -key ${paths.rootCAKey} -sha256 -days 3650 -out ${paths.rootCACert} -subj "/CN=Katana Root CA/O=Katana"`.quiet();

			// Generate wildcard private key (2048 bit)
			console.log("Generating wildcard private key...");
			const wildcardKey = join(certsDir, CERT_FILES.WILDCARD_KEY);
			await Bun.$`openssl genrsa -out ${wildcardKey} 2048`.quiet();

			// Generate CSR for wildcard cert
			console.log("Generating certificate signing request...");
			const wildcardCsr = join(certsDir, CERT_FILES.WILDCARD_CSR);
			await Bun.$`openssl req -new -key ${wildcardKey} -out ${wildcardCsr} -subj "/CN=*.${domainBase}/O=Katana"`.quiet();

			// Create extensions file for SAN
			const wildcardExt = join(certsDir, CERT_FILES.WILDCARD_EXT);
			const extContent = `authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,nonRepudiation,keyEncipherment,dataEncipherment
subjectAltName=@alt_names

[alt_names]
DNS.1=*.${domainBase}
DNS.2=${domainBase}
`;
			await Bun.write(wildcardExt, extContent);

			// Sign wildcard cert with Root CA (2 years)
			console.log("Signing wildcard certificate...");
			await Bun.$`openssl x509 -req -in ${wildcardCsr} -CA ${paths.rootCACert} -CAkey ${paths.rootCAKey} -CAcreateserial -out ${paths.cert} -days 730 -sha256 -extfile ${wildcardExt} -extensions v3_req`.quiet();

			// Clean up temporary files
			await Bun.$`rm -f ${wildcardCsr} ${wildcardExt}`.quiet();

			// Save state
			const state: CertState = {
				initialized: true,
				domainBase,
				createdAt: new Date().toISOString(),
			};
			await this.saveCertState(state);

			return {
				success: true,
				message: `Certificates generated for *.${domainBase}`,
				certPaths: paths,
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to generate certificates: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Install Root CA to system trust store
	 */
	async installCA(): Promise<InstallCAResult> {
		// Mock mode
		if (isMockMode()) {
			return {
				success: true,
				message: "[mock] Root CA installed to system trust store",
			};
		}

		// Check if certs exist
		if (!(await this.hasCerts())) {
			return {
				success: false,
				message: "Certificates not initialized. Run 'katana cert init' first.",
			};
		}

		const paths = this.getCertPaths();
		const destPath = "/usr/local/share/ca-certificates/katana-root-ca.crt";

		try {
			// Copy root CA to system trust store
			console.log(`Copying Root CA to ${destPath}...`);
			await Bun.$`cp ${paths.rootCACert} ${destPath}`.quiet();

			// Update CA certificates
			console.log("Updating CA certificates...");
			await Bun.$`update-ca-certificates`.quiet();

			return {
				success: true,
				message: "Root CA installed to system trust store",
			};
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);

			// Check for permission error
			if (errorMsg.includes("Permission denied") || errorMsg.includes("EACCES")) {
				return {
					success: false,
					message: `Permission denied. Try running with sudo:\n  sudo katana cert install-ca`,
				};
			}

			return {
				success: false,
				message: `Failed to install CA: ${errorMsg}`,
			};
		}
	}
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get the singleton CertManager instance
 */
export function getCertManager(options?: CertManagerOptions): CertManager {
	return CertManager.getInstance(options);
}
