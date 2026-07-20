/**
 * Base error for all Katana errors
 */
export class KatanaError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "KatanaError";
  }

  /**
   * Suggested fix for the error (optional)
   */
  help?(): string;
}

/**
 * Configuration errors
 */
export class ConfigError extends KatanaError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

/**
 * State file errors
 */
export class StateError extends KatanaError {
  constructor(message: string) {
    super(message, "STATE_ERROR");
    this.name = "StateError";
  }
}

/**
 * Module validation errors
 */
export class ModuleError extends KatanaError {
  constructor(
    message: string,
    public moduleName?: string,
  ) {
    super(message, "MODULE_ERROR");
    this.name = "ModuleError";
  }
}

/**
 * Docker operation errors
 */
export class DockerError extends KatanaError {
  constructor(message: string) {
    super(message, "DOCKER_ERROR");
    this.name = "DockerError";
  }
}

export class DockerNotRunningError extends DockerError {
  constructor() {
    super("Docker daemon is not running");
  }

  override help() {
    return "Run: sudo systemctl start docker";
  }
}

export class DockerPermissionError extends DockerError {
  constructor() {
    super("Permission denied accessing Docker socket");
  }

  override help() {
    return "Add user to docker group: sudo usermod -aG docker $USER && newgrp docker";
  }
}

/**
 * Certificate errors
 */
export class CertError extends KatanaError {
  constructor(message: string) {
    super(message, "CERT_ERROR");
    this.name = "CertError";
  }
}

/**
 * Certificate not initialized error
 */
export class CertNotInitializedError extends CertError {
  constructor() {
    super("Certificates not initialized");
  }

  override help() {
    return "Run: katana cert init";
  }
}

/**
 * Certificate expired error
 */
export class CertExpiredError extends CertError {
  constructor(daysAgo: number) {
    super(`Server certificate expired ${Math.abs(daysAgo)} days ago`);
  }

  override help() {
    return "Run: katana cert renew";
  }
}

/**
 * OpenSSL not found error
 */
export class OpenSSLNotFoundError extends CertError {
  constructor() {
    super("OpenSSL command not found");
  }

  override help() {
    return "Install OpenSSL: sudo apt install openssl";
  }
}

/**
 * DNS errors
 */
export class DNSError extends KatanaError {
  constructor(message: string) {
    super(message, "DNS_ERROR");
    this.name = "DNSError";
  }
}

export class DNSPermissionError extends DNSError {
  constructor() {
    super("Permission denied modifying /etc/hosts");
  }

  override help() {
    return "Run: sudo katana dns sync";
  }
}

/**
 * Proxy errors
 */
export class ProxyError extends KatanaError {
  constructor(message: string) {
    super(message, "PROXY_ERROR");
    this.name = "ProxyError";
  }
}

export class PortBindError extends ProxyError {
  constructor(
    public port: number,
    reason?: string,
  ) {
    super(`Cannot bind to port ${port}${reason ? `: ${reason}` : ""}`);
  }

  override help() {
    if (this.port < 1024) {
      return "Run: sudo katana setup-proxy";
    }
    return `Check if another process is using port ${this.port}`;
  }
}

export class ContainerNotReachableError extends ProxyError {
  constructor(
    public containerName: string,
    reason?: string,
  ) {
    super(`Cannot reach container ${containerName}${reason ? `: ${reason}` : ""}`);
  }

  override help() {
    return "Verify the target is running with: katana status";
  }
}

export class RouteNotFoundError extends ProxyError {
  constructor(public hostname: string) {
    super(`No route found for hostname: ${hostname}`);
  }
}

/**
 * Lock errors
 */
export class SystemLockedError extends KatanaError {
  constructor() {
    super("System is locked - cannot modify targets", "SYSTEM_LOCKED");
    this.name = "SystemLockedError";
  }

  override help() {
    return "Run: katana unlock";
  }
}

/**
 * Not found errors
 */
export class NotFoundError extends KatanaError {
  constructor(type: string, name: string) {
    super(`${type} not found: ${name}`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

/**
 * Already exists errors
 */
export class AlreadyExistsError extends KatanaError {
  constructor(type: string, name: string) {
    super(`${type} already exists: ${name}`, "ALREADY_EXISTS");
    this.name = "AlreadyExistsError";
  }
}
