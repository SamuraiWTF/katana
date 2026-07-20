/**
 * API route dispatcher
 */

import { handleGetCA } from "./certs.ts";
import { handleGetModules, handleModuleOperation } from "./modules.ts";
import { handleGetOperation, handleOperationStream } from "./operations.ts";
import { handleGetSystem, handleLock, handleUnlock } from "./system.ts";

/**
 * Handle API requests
 * Returns null if not an API route
 */
export async function handleApiRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  // Module routes
  // GET /api/modules
  if (pathname === "/api/modules" && method === "GET") {
    return handleGetModules(req);
  }

  // POST /api/modules/:name/:operation
  const moduleOpMatch = pathname.match(/^\/api\/modules\/([^/]+)\/(install|remove|start|stop)$/);
  if (moduleOpMatch && method === "POST") {
    const name = moduleOpMatch[1];
    const operation = moduleOpMatch[2];
    if (name && operation) {
      return handleModuleOperation(req, name, operation);
    }
  }

  // Operation routes
  // GET /api/operations/:id
  const opStatusMatch = pathname.match(/^\/api\/operations\/([^/]+)$/);
  if (opStatusMatch && method === "GET") {
    const operationId = opStatusMatch[1];
    if (operationId) {
      return handleGetOperation(req, operationId);
    }
  }

  // GET /api/operations/:id/stream
  const opStreamMatch = pathname.match(/^\/api\/operations\/([^/]+)\/stream$/);
  if (opStreamMatch && method === "GET") {
    const operationId = opStreamMatch[1];
    if (operationId) {
      return handleOperationStream(req, operationId);
    }
  }

  // System routes
  // GET /api/system
  if (pathname === "/api/system" && method === "GET") {
    return handleGetSystem(req);
  }

  // POST /api/system/lock
  if (pathname === "/api/system/lock" && method === "POST") {
    return handleLock(req);
  }

  // POST /api/system/unlock
  if (pathname === "/api/system/unlock" && method === "POST") {
    return handleUnlock(req);
  }

  // Certificate routes
  // GET /api/certs/ca
  if (pathname === "/api/certs/ca" && method === "GET") {
    return handleGetCA(req);
  }

  // Not an API route we recognize
  return null;
}
