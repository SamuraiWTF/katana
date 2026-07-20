/**
 * API routes for certificate management
 */

import { getCertManager } from "../../core/cert-manager.ts";

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * GET /api/certs/ca
 * Download the CA certificate for browser import
 */
export async function handleGetCA(_req: Request): Promise<Response> {
  try {
    const certManager = getCertManager();
    const caCertPath = certManager.getCACertPath();

    // Check if CA exists
    const caFile = Bun.file(caCertPath);
    if (!(await caFile.exists())) {
      return Response.json(
        {
          success: false,
          error: "CA certificate not initialized. Run 'katana cert init' first.",
        },
        { status: 404 },
      );
    }

    // Read the CA certificate
    const caContent = await caFile.text();

    // Return as downloadable file
    return new Response(caContent, {
      headers: {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition": 'attachment; filename="katana-ca.crt"',
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
