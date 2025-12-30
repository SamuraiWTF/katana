import { z } from "zod";

/**
 * Certificate state schema - tracks initialized certs in <statePath>/certs/cert-state.yml
 */
export const CertStateSchema = z.object({
	/** Whether certificates have been initialized */
	initialized: z.boolean(),
	/** The domain base the certs were generated for (e.g., "test", "abcde.penlabs.net") */
	domainBase: z.string(),
	/** ISO timestamp when certs were created */
	createdAt: z.string(),
});

export type CertState = z.infer<typeof CertStateSchema>;

/**
 * Certificate paths returned by CertManager
 */
export interface CertPaths {
	/** Path to wildcard certificate */
	cert: string;
	/** Path to wildcard private key */
	key: string;
	/** Path to root CA certificate */
	rootCACert: string;
	/** Path to root CA private key */
	rootCAKey: string;
}

/**
 * Certificate file names in the certs directory
 */
export const CERT_FILES = {
	ROOT_CA_KEY: "rootCA.key",
	ROOT_CA_CERT: "rootCA.crt",
	WILDCARD_KEY: "wildcard.key",
	WILDCARD_CERT: "wildcard.crt",
	WILDCARD_CSR: "wildcard.csr",
	WILDCARD_EXT: "wildcard.ext",
	STATE_FILE: "cert-state.yml",
} as const;
