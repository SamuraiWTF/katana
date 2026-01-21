/**
 * API client for the Katana dashboard
 */

// =============================================================================
// Types
// =============================================================================

export type ModuleStatus = "not_installed" | "installed" | "running" | "stopped" | "unknown";

export interface ModuleInfo {
  name: string;
  category: "targets" | "tools";
  description: string;
  status: ModuleStatus;
  hrefs: string[];
}

export interface ModulesResponse {
  success: true;
  data: {
    modules: ModuleInfo[];
    locked: boolean;
    lockMessage?: string;
  };
}

export interface OperationResponse {
  success: true;
  data: {
    operationId: string;
  };
}

export interface SystemStatus {
  prerequisites: {
    docker: {
      installed: boolean;
      version: string | null;
      daemonRunning: boolean;
      userCanConnect: boolean;
    };
  };
  system: {
    os: string;
    kernel: string;
    uptime: string;
    memory: {
      total: number;
      used: number;
      percentUsed: number;
    };
    disk: {
      path: string;
      total: number;
      used: number;
      percentUsed: number;
    };
  };
  katana: {
    certs: {
      valid: boolean;
      expiresAt: string | null;
      daysUntilExpiration: number | null;
    };
    proxy: {
      running: boolean;
      routeCount: number;
    };
    dns: {
      inSync: boolean;
      managedCount: number;
      expectedCount: number;
    } | null;
  };
}

export interface SystemStatusResponse {
  success: true;
  data: SystemStatus;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = T | ErrorResponse;

// =============================================================================
// API Client
// =============================================================================

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new ApiError(data.error || `HTTP ${response.status}`, response.status);
  }

  return data as T;
}

/**
 * Fetch all modules with their status
 */
export async function fetchModules(category?: "targets" | "tools"): Promise<ModulesResponse> {
  const url = category ? `/api/modules?category=${category}` : "/api/modules";
  const response = await fetch(url);
  return handleResponse<ModulesResponse>(response);
}

/**
 * Start an operation on a module (install, remove, start, stop)
 */
export async function startOperation(
  moduleName: string,
  operation: "install" | "remove" | "start" | "stop",
): Promise<OperationResponse> {
  const response = await fetch(`/api/modules/${moduleName}/${operation}`, {
    method: "POST",
  });
  return handleResponse<OperationResponse>(response);
}

/**
 * Fetch system status
 */
export async function fetchSystemStatus(): Promise<SystemStatusResponse> {
  const response = await fetch("/api/system");
  return handleResponse<SystemStatusResponse>(response);
}

/**
 * Lock the system to prevent changes
 */
export async function lockSystem(): Promise<{ success: true }> {
  const response = await fetch("/api/system/lock", { method: "POST" });
  return handleResponse<{ success: true }>(response);
}

/**
 * Unlock the system to allow changes
 */
export async function unlockSystem(): Promise<{ success: true }> {
  const response = await fetch("/api/system/unlock", { method: "POST" });
  return handleResponse<{ success: true }>(response);
}

/**
 * Get the CA certificate download URL
 */
export function getCACertUrl(): string {
  return "/api/certs/ca";
}

export { ApiError };
