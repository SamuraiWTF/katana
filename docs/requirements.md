# Katana Bun/TypeScript Reimplementation Requirements

## Executive Summary

Katana is a specialized package manager for SamuraiWTF (Web Testing Framework), designed to simplify deployment of vulnerable web applications and security testing tools for cybersecurity training environments. This document outlines requirements for a modern reimplementation using Bun/TypeScript that addresses current limitations while maintaining compatibility with existing module definitions.

## 1. Core Functional Requirements

### 1.1 Module Management

**Must Have:**
- Install/remove/start/stop modules (targets, tools, base services)
- Query module status (not installed, installed, stopped, running, blocked, unknown)
- Support for YAML-based module definitions (maintain backward compatibility)
- Automatic dependency resolution and installation
- Idempotent operations (safe to execute multiple times)
- Concurrent operation prevention (no simultaneous operations on same module)

**Module Categories:**
- `targets` - Vulnerable web applications for penetration testing practice
- `tools` - Security testing tools
- `base` - Infrastructure services (Docker daemon, nginx)
- `management` - Katana system itself

### 1.2 Command Line Interface

**Must Have:**
```bash
katana init                  # Initialize Katana configuration (domain, paths, etc.)
katana install <module>      # Install a module
katana remove <module>       # Remove a module
katana start <module>        # Start a stopped module
katana stop <module>         # Stop a running module
katana status <module>       # Check module status
katana list [category]       # List available modules
katana lock                  # Lock environment (instructor mode)
katana unlock                # Unlock environment
katana update                # Update module definitions from repository
```

**Nice to Have:**
- `katana validate <module>` - Validate YAML syntax
- `katana logs <module>` - View module logs
- Progress indicators for long-running operations
- Colored/formatted output
- Shell completion support

### 1.3 Web Interface

**Must Have:**
- Modern responsive UI accessible via configured domain or `http://localhost:8087`
- Real-time operation status updates (no 3-second polling)
- Module listing organized by category
- Action buttons based on current module state
- "Open" button for modules with `href` (disabled when not running)
- Visual feedback during operations (progress, not just "changing")
- Display configured base domain for module access

**Current Pain Point:**
The Python implementation has timeout issues when installing larger targets from the web interface due to long-running synchronous operations.

**Solution - Server-Sent Events (SSE):**
- Implement SSE for real-time progress streaming
- Stream installation logs, Docker pull progress, and task execution updates
- Allow cancellation of in-progress operations
- Provide detailed error messages with actionable guidance

**UI Framework:**
- React with shadcn UI components for modern, accessible component library
- Vite for build tooling (fast, minimal config, works well with Bun)
- TailwindCSS (required by shadcn) for utility-first styling
- shadcn provides copy-paste components built on Radix UI primitives

### 1.4 Lock Mode (Classroom Management)

**Must Have:**
- Instructors can lock environment to prevent student modifications
- When locked, only installed modules are visible
- Lock state persists across restarts
- Lock file format compatible with existing `katana.lock`

**Nice to Have:**
- Web UI indication of lock status
- Lock with message/banner for students
- Time-based auto-unlock

## 2. Module Definition System

### 2.1 YAML Schema Compatibility

**Must Have - Maintain backward compatibility with existing modules:**

```yaml
---
name: string                    # Module identifier (used as subdomain)
category: targets|tools|base    # Category classification
description: string             # Human-readable description
href: string?                   # URL template for "Open" button (optional)
                                # Can use {module} and {domain.base} placeholders
                                # e.g., "https://{module}.{domain.base}:8443"
                                # or legacy format: "https://juice-shop.test:8443"
depends-on: string[]?           # Module dependencies (optional)
class: string?                  # Custom provisioner (optional)

install:                        # Installation tasks
  - name?: string               # Optional task description
    <plugin>:                   # Plugin identifier (docker, service, etc.)
      <params>: <values>        # Plugin-specific parameters

remove: [...]                   # Removal tasks
start: [...]                    # Start tasks
stop: [...]                     # Stop tasks

status:                         # Status check definitions
  running:
    started:
      docker?: string
      service?: string
  installed:
    exists:
      docker?: string
      path?: string
```

**Module URL Generation:**
- If `href` contains placeholders (`{module}`, `{domain.base}`), they will be replaced with config values
- If `href` is a complete URL (legacy format), it will be used as-is
- If `href` is omitted, Katana will auto-generate: `https://{name}.{domain.base}:{domain.tls_port}`
- The ReverseProxy plugin will read domain configuration and generate appropriate nginx configs

### 2.2 Module Discovery

**Must Have:**
- Scan `modules/` directory recursively for `*.yml` files
- Parse and validate YAML on startup
- Hot reload when module files change (dev mode)
- Graceful error handling for malformed YAML

### 2.3 Dependency Resolution

**Must Have:**
- Build dependency graph for all modules
- Detect circular dependencies
- Install/start dependencies before target module
- Fail fast with clear error message on missing dependencies

**Algorithm:**
- Topological sort for installation order
- Recursive dependency traversal with cycle detection

## 3. Provisioning System

### 3.1 Plugin Architecture

**Design Pattern:**
Similar to the Python implementation but leveraging TypeScript features:

```typescript
interface IPlugin {
  readonly aliases: string[];                    // Plugin names (e.g., ['docker'])

  install?(params: PluginParams): Promise<void>;
  remove?(params: PluginParams): Promise<void>;
  start?(params: PluginParams): Promise<void>;
  stop?(params: PluginParams): Promise<void>;

  // Status check methods
  exists?(params: PluginParams): Promise<boolean>;
  started?(params: PluginParams): Promise<boolean>;
}

abstract class BasePlugin implements IPlugin {
  abstract aliases: string[];

  protected async exec(command: string): Promise<string> {
    // Bun.spawn() for command execution
  }

  protected validateParams(params: any, schema: Schema): void {
    // Parameter validation with Zod
  }
}
```

### 3.2 Required Plugins

**Must Have:**

| Plugin | Purpose | Implementation Notes |
|--------|---------|---------------------|
| **Docker** | Container lifecycle management | Use dockerode (JavaScript Docker client) or Bun.spawn for docker CLI |
| **Service** | systemd service control | Bun.spawn with systemctl commands |
| **ReverseProxy** | Nginx + SSL config | Generate configs using domain.base from config, create SSL certs with openssl |
| **LineInFile** | File content management | Read, modify, write with atomic operations |
| **Copy** | File creation with content | Bun.write() with permissions |
| **File** | Directory creation | fs.mkdir with recursive option |
| **Command** | Shell command execution | Bun.spawn() with shell option |
| **Git** | Repository cloning | Bun.spawn with git CLI (simpler than isomorphic-git) |
| **GetUrl** | HTTP downloads | fetch API with progress tracking |
| **Unarchive** | Archive extraction | tar CLI or JavaScript tar library |
| **Started** | Status: is service running? | Check systemctl/docker status |
| **Exists** | Status: does resource exist? | fs.stat / docker ps checks |

**Nice to Have:**
- **Compose** - Docker Compose file support (many modern apps use compose)
- **Apt/Dnf** - System package installation
- **Systemd** - Create/manage systemd service files
- **Template** - Jinja2-style templating for config files

### 3.3 Provisioner Pattern

**Simplified Design:**
Rather than multiple provisioner classes, use a single `TaskExecutor`:

```typescript
class TaskExecutor {
  private plugins: Map<string, IPlugin>;

  async executeTask(task: Task, emitter?: EventEmitter): Promise<void> {
    // 1. Find plugin by task key
    // 2. Validate parameters
    // 3. Execute appropriate method (install/remove/start/stop)
    // 4. Emit progress events for SSE streaming
    // 5. Handle errors with context
  }

  async executeTasks(tasks: Task[], emitter?: EventEmitter): Promise<void> {
    // Execute task list sequentially
    // Stream progress via emitter
  }
}
```

## 4. Installation State Management

### 4.1 Persistence

**Must Have:**
- Track installed modules in `installed.yml` (backward compatible)
- Format: `{ [moduleName: string]: version }`
- Atomic file writes (write temp file, then rename)
- File locking to prevent concurrent modifications

**Future Enhancement:**
- SQLite database for richer state tracking:
  - Installation timestamps
  - Resource tracking (containers, files, services created)
  - Rollback support
  - Installation logs

### 4.2 Status Checking

**Must Have:**
- Implement status checks defined in module YAML
- Status hierarchy:
  1. Run `running.started` checks → if all pass, status = "running"
  2. Run `installed.exists` checks → if all pass, status = "stopped" or "installed"
  3. Otherwise, status = "not installed"
- Handle checks failing due to permissions/missing tools gracefully

**Performance:**
- Cache status results with TTL (e.g., 5 seconds)
- Parallel status checks for multiple modules
- Lazy evaluation for list operations

## 5. Web Server & API

### 5.1 HTTP Server

**Technology Choice:**
- Bun.serve() - Native HTTP server (excellent performance, built-in WebSocket)
- Or Hono - Lightweight Express-like framework for Bun (better routing/middleware)

**Port:** 8087 (maintain backward compatibility)

### 5.2 API Endpoints

**REST API:**
```
GET  /api/modules              → List all modules with status
GET  /api/modules/:category    → List modules by category
GET  /api/modules/:name        → Get module details
POST /api/modules/:name/install → Install module
POST /api/modules/:name/remove  → Remove module
POST /api/modules/:name/start   → Start module
POST /api/modules/:name/stop    → Stop module
GET  /api/modules/:name/status  → Get module status
GET  /api/lock                  → Get lock status
POST /api/lock                  → Enable lock mode
DELETE /api/lock                → Disable lock mode
```

**Server-Sent Events:**
```
GET  /api/modules/:name/operations/:operationId/stream
     → Stream operation progress/logs in real-time
```

**SSE Event Types:**
```typescript
type SSEEvent =
  | { type: 'progress', data: { task: string, current: number, total: number } }
  | { type: 'log', data: { level: 'info'|'warn'|'error', message: string } }
  | { type: 'status', data: { status: ModuleStatus } }
  | { type: 'complete', data: { success: boolean, message?: string } }
  | { type: 'error', data: { error: string, details?: string } };
```

### 5.3 Response Formats

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "ModuleNotFoundError",
  "message": "Module 'juice-shop' not found",
  "details": "Available modules: ..."
}
```

### 5.4 Operation Tracking

**Challenge:** Long-running operations in web context

**Solution:**
```typescript
// 1. Generate operation ID
const operationId = crypto.randomUUID();

// 2. Start operation in background (Bun Worker or async)
operations.set(operationId, {
  moduleId: 'juice-shop',
  type: 'install',
  status: 'running',
  emitter: new EventEmitter()
});

// 3. Return operation ID immediately
return { operationId, streamUrl: `/api/operations/${operationId}/stream` };

// 4. Client connects to SSE stream
// 5. Stream progress events until completion
```

## 6. Error Handling & Logging

### 6.1 Error Types

**Define custom errors:**
```typescript
class ModuleNotFoundError extends Error {}
class DependencyError extends Error {}
class PluginError extends Error {}
class PermissionError extends Error {}
class TimeoutError extends Error {}
class LockError extends Error {}  // Operation blocked by lock mode
```

### 6.2 Logging

**Requirements:**
- Structured logging (JSON format for parsing)
- Log levels: DEBUG, INFO, WARN, ERROR
- Separate log files for:
  - Application logs: `/var/log/katana/katana.log`
  - Operation logs: `/var/log/katana/operations/<operationId>.log`
- Log rotation (max size, max age)

**Libraries:**
- pino - High-performance JSON logger (works with Bun)
- winston - More features but slower

### 6.3 Recovery & Rollback

**Nice to Have:**
- Track resources created during installation (containers, files, services)
- On failure, attempt to rollback changes
- Idempotent operations allow re-running install to fix incomplete states
- `katana repair <module>` command to fix broken installations

## 7. Security Considerations

### 7.1 Execution Context

**Important:**
- Katana requires root/sudo privileges (Docker, systemd, /etc/hosts, nginx)
- Designed for isolated training environments, NOT production
- No authentication on web interface (assumes trusted network)

**Recommendations for Bun version:**
- Document privilege requirements clearly
- Add `--unsafe-perm` flag check
- Provide Docker-in-Docker option (run Katana in privileged container)
- Optional: Add basic auth for web UI (environment variable controlled)

### 7.2 Input Validation

**Must Have:**
- Validate all YAML inputs against schema (use Zod or JSON Schema)
- Sanitize shell command inputs (prevent command injection)
- Validate file paths (prevent directory traversal)
- Whitelist module names (alphanumeric + hyphen only)

**Libraries:**
- Zod - TypeScript-first schema validation
- shell-escape - Escape shell command arguments

### 7.3 SSL Certificates

**Current Approach:**
- Self-signed certificates generated per module
- Stored in `/etc/samurai.d/certs/`
- Users must accept browser warnings

**Enhancement Consideration:**
- Generate single CA certificate on first run
- Sign all module certificates with CA
- Provide CA cert for user import (eliminates warnings)

## 8. Platform Support & Portability

### 8.1 Platform Priority

**Primary Target:** Linux (Ubuntu 24.04 LTS, Debian 12+)

**Must Have - Linux:**
- Docker support (dockerd via systemd or socket)
- systemd service management
- nginx reverse proxy
- /etc/hosts management
- OpenSSL for certificate generation

**Nice to Have - Other Platforms:**
- macOS support (Lima VM for Docker, /etc/hosts, nginx via Homebrew)
- WSL2 support (Windows Subsystem for Linux)

**Explicitly Not Supported:**
- Native Windows (too many dependencies on Unix tooling)

### 8.2 Dependency Detection

**Runtime Checks:**
On startup, verify:
```typescript
const REQUIRED_DEPENDENCIES = [
  { name: 'docker', check: 'docker --version', required: true },
  { name: 'systemd', check: 'systemctl --version', required: true },
  { name: 'nginx', check: 'nginx -v', required: true },
  { name: 'openssl', check: 'openssl version', required: true },
  { name: 'git', check: 'git --version', required: false },
];
```

**Graceful Degradation:**
- If Docker not available: disable Docker-based modules
- If systemd not available: fall back to direct process management
- Clear error messages: "Module requires Docker which is not available"

### 8.3 Installation Methods

**Primary Method:**
- Compiled binary executable (download and run, no dependencies)
- GitHub Releases provide pre-compiled binaries for Linux x64/ARM64

**Development:**
- Clone repository and run with `bun run src/cli.ts`

**Future Enhancements:**
- DEB/RPM packages for system integration
- Docker image (Katana running in container managing host Docker)
- Homebrew formula (macOS)
- NPM package (if broader distribution desired)

### 8.4 Configuration

**Config File:** `/etc/katana/config.yml` (or `~/.config/katana/config.yml`)

**Initialization:** Run `katana init` to interactively configure Katana:
- Base domain for module access (e.g., `mydomain.internal`, `wtf`, `local`)
- Installation paths
- Server port
- Generates initial config file

**Configuration Structure:**

```yaml
# Katana Configuration

domain:
  base: wtf                    # Base domain for modules (e.g., dvwa.wtf, juice-shop.wtf)
  tls_port: 8443               # Port for TLS/HTTPS access via nginx reverse proxy
  ui_hostname: katana          # Hostname for Katana UI (e.g., katana.wtf)

server:
  host: 0.0.0.0
  port: 8087                   # Direct HTTP port for Katana API/UI

paths:
  modules: /opt/katana/modules
  installed: /opt/katana/installed.yml
  lock: /opt/katana/katana.lock
  logs: /var/log/katana
  certs: /etc/samurai.d/certs
  nginx_conf: /etc/nginx/conf.d

logging:
  level: info
  format: json

features:
  auth_enabled: false
  auth_user: admin
  auth_password: changeme
```

**Domain Configuration Details:**

When a module is installed (e.g., `dvwa`), Katana will:
1. Add `/etc/hosts` entry: `127.0.0.1 dvwa.{base_domain}`
2. Generate nginx reverse proxy config for `dvwa.{base_domain}:{tls_port}`
3. Create self-signed SSL certificate for the module
4. Module becomes accessible at `https://dvwa.{base_domain}:{tls_port}`

**Examples:**
- `base: wtf` → modules accessible at `dvwa.wtf:8443`, `juice-shop.wtf:8443`
- `base: mydomain.internal` → modules at `dvwa.mydomain.internal:8443`
- `base: local` → modules at `dvwa.local:8443`

The Katana web UI itself will be accessible at:
- Direct: `http://localhost:{server.port}` (e.g., `http://localhost:8087`)
- Via reverse proxy: `https://{ui_hostname}.{base_domain}:{tls_port}` (e.g., `https://katana.wtf:8443`)

**Backward Compatibility:**
- Default configuration uses `base: wtf` to match existing behavior
- Existing modules work without modification
- Users can customize domain during `katana init` or by editing config file

## 9. Performance Requirements

### 9.1 Responsiveness

**Must Have:**
- Web UI initial load: < 1 second
- Module list API: < 100ms
- Status check (single module): < 500ms
- Status check (all modules): < 2 seconds

### 9.2 Concurrent Operations

**Must Have:**
- Support multiple concurrent operations on different modules
- Block concurrent operations on same module
- Maximum concurrent installations: configurable (default: 3)

**Implementation:**
```typescript
class OperationQueue {
  private running = new Map<string, Promise<void>>();
  private maxConcurrent = 3;

  async run(moduleId: string, operation: () => Promise<void>): Promise<void> {
    // Check if operation already running for module
    if (this.running.has(moduleId)) {
      throw new Error('Operation already in progress');
    }

    // Wait if too many operations running
    while (this.running.size >= this.maxConcurrent) {
      await Promise.race(this.running.values());
    }

    // Execute operation
    const promise = operation().finally(() => this.running.delete(moduleId));
    this.running.set(moduleId, promise);
    return promise;
  }
}
```

## 10. Testing Requirements

### 10.1 Unit Tests

**Must Have:**
- Plugin logic (Docker, Service, ReverseProxy, etc.)
- YAML parsing and validation
- Dependency resolution algorithm
- Status checking logic
- Error handling

**Framework:** Bun built-in test runner

### 10.2 Integration Tests

**Must Have:**
- Module installation/removal/start/stop workflows
- API endpoint behavior
- SSE streaming
- Lock mode functionality

**Approach:**
- Test against real Docker daemon (require Docker in CI)
- Mock systemd interactions (or use user systemd services)
- Fixture modules for testing

### 10.3 End-to-End Tests

**Nice to Have:**
- Playwright tests for web UI
- Test actual module installations (juice-shop, etc.)
- Test reverse proxy and SSL certificate generation

**Current Approach:**
The Python version uses bash scripts in `tests/` that:
1. Install modules
2. Verify HTTP endpoints are accessible
3. Check service status
4. Clean up modules

This approach should be maintained with improvements:
- Port tests to TypeScript (better error handling)
- Add retry logic with exponential backoff
- Parallel test execution where possible

## 11. Documentation Requirements

### 11.1 User Documentation

**Must Have:**
- README with installation instructions
- Usage guide (CLI commands, web UI)
- Module author guide (creating new modules)
- Troubleshooting guide
- Architecture overview

### 11.2 Developer Documentation

**Must Have:**
- API documentation (OpenAPI/Swagger spec)
- Plugin development guide
- Architecture decision records (ADRs)
- Contributing guide

### 11.3 Inline Documentation

**Must Have:**
- TSDoc comments for all public APIs
- README in each major directory
- Schema documentation for YAML format

## 12. Migration & Backward Compatibility

### 12.1 Module Compatibility

**Must Have:**
- Support existing YAML module definitions without modification
- Parse and execute all current plugin types
- Maintain port assignments and reverse proxy behavior

### 12.2 State Migration

**Must Have:**
- Read existing `installed.yml` file
- Honor existing `katana.lock` file
- Import module installation state on first run

### 12.3 Deprecation Path

**Future:**
- Run Python and Bun versions side-by-side during transition
- Provide migration tool: `katana-migrate export/import`
- Document breaking changes and migration steps

## 13. Development Workflow

### 13.1 Project Structure

```
katana/
├── src/
│   ├── cli/              # CLI entry point and commands
│   ├── server/           # Web server and API routes
│   ├── core/             # Core engine (module loading, orchestration)
│   ├── plugins/          # Plugin implementations
│   ├── provisioners/     # Provisioning logic
│   ├── utils/            # Shared utilities
│   └── types/            # TypeScript type definitions
├── modules/              # Module YAML definitions
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── scripts/              # Build and maintenance scripts
├── package.json
├── tsconfig.json
└── bunfig.toml
```

### 13.2 Development Tools

**Must Have:**
- TypeScript with strict mode
- Biome or ESLint + Prettier for linting/formatting
- Bun test runner for unit/integration tests
- Bun build for compilation

### 13.3 CI/CD

**Must Have:**
- GitHub Actions workflows
- Run tests on push/PR
- Test on Ubuntu 24.04 LTS (primary target)
- Code coverage reporting

**Nice to Have:**
- Test on multiple Linux distros (Debian 12+, Fedora)
- Automated release builds
- Publish to NPM on tag

## 14. Non-Functional Requirements

### 14.1 Code Quality

**Must Have:**
- TypeScript strict mode (no implicit any)
- Minimum 70% code coverage
- No critical security vulnerabilities (npm audit / Snyk)
- Documented public APIs

### 14.2 Maintainability

**Principles:**
- Separation of concerns (CLI / Server / Core / Plugins)
- Dependency injection for testability
- Immutable data structures where possible
- Functional programming style for business logic

### 14.3 Observability

**Must Have:**
- Structured logging (pino or similar)
- Operation tracing (correlate logs by operationId)
- Health check endpoint: `GET /health`

**Nice to Have:**
- Metrics endpoint (Prometheus format)
- OpenTelemetry tracing support

## 15. Timeline-Free Phased Implementation

### Phase 1: Core Foundation
- CLI skeleton with command routing
- YAML module loader and validator
- Basic plugin system (Docker, Command, File, Copy)
- Simple provisioning engine
- Unit tests for core logic

### Phase 2: Web Interface & SSE
- Bun.serve HTTP server with routing
- REST API endpoints
- SSE implementation for operation streaming
- Basic HTML/CSS UI (no framework yet)
- Operation queue and concurrency control

### Phase 3: Complete Plugin Set
- Implement all required plugins (Service, ReverseProxy, etc.)
- Status checking system
- Dependency resolution
- Integration tests

### Phase 4: Feature Parity
- Lock mode
- State persistence (installed.yml)
- Configuration file support
- Error handling and recovery
- E2E tests with real modules

### Phase 5: Modern UI
- React/Preact frontend with Vite
- Real-time updates via SSE
- Progress indicators and log streaming
- Responsive design

### Phase 6: Polish & Production Ready
- Documentation (user + developer)
- Installation packages (DEB, binary)
- Migration tools
- Performance optimization
- Security hardening

## 16. Success Criteria

**The Bun/TypeScript implementation will be considered successful when:**

1. **Feature Parity:** All existing modules can be installed/managed without modification
2. **Performance:** Web operations complete without timeouts, even for large targets
3. **User Experience:** Real-time progress feedback eliminates confusion during installations
4. **Reliability:** Idempotent operations and proper error handling prevent broken states
5. **Maintainability:** TypeScript codebase is easier to understand and extend than Python version
6. **Compatibility:** Existing instructors can switch with minimal disruption
7. **Documentation:** New users can get started without reading Python code

## 17. Open Questions & Decisions Needed

### 17.1 UI Framework Choice

**Decision:** React + Vite + shadcn UI

**Rationale:**
- shadcn UI provides accessible, customizable components built on Radix UI
- Copy-paste component model (no package bloat, full control)
- TailwindCSS integration for consistent styling
- Excellent TypeScript support
- Active community and comprehensive documentation

### 17.2 HTTP Framework
**Options:**
1. **Bun.serve** - Native, minimal, requires manual routing
2. **Hono** - Express-like, designed for edge runtimes, excellent TypeScript support
3. **Elysia** - Bun-first framework, great DX, includes WebSocket support

**Recommendation:** Hono (best balance of simplicity and features)

### 17.3 Docker Integration
**Options:**
1. **dockerode** - Official Docker client for Node.js/Bun
2. **Bun.spawn('docker', [...])** - Shell out to Docker CLI

**Recommendation:** Start with Bun.spawn (simpler), migrate to dockerode if needed

### 17.4 State Management

**Decision:** YAML files

**Rationale:**
- Maintains backward compatibility with Python implementation
- Simple, human-readable format
- No additional database dependencies
- Sufficient for current use cases
- Can migrate to SQLite in future if needed

### 17.5 Distribution Method

**Decision:** Compiled binary executable

**Rationale:**
- Bun can compile to single executable binary (no runtime dependencies)
- GitHub Actions workflow will compile on tag push for releases
- Local development: run directly with Bun
- Simplest distribution method (just download and run)
- No NPM/system package complexity for initial release

**Implementation:**
- Development: `bun run src/cli.ts`
- Production: `bun build --compile --outfile katana src/cli.ts`
- CI/CD: GitHub Actions compiles binary on git tag, attaches to release

## 18. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bun runtime bugs/incompatibilities | High | Test extensively; fall back to Node.js if needed |
| Docker API changes breaking plugin | Medium | Version lock dockerode; integration tests |
| Timeout issue persists with SSE | High | Implement cancellation; use WebWorkers for CPU-intensive ops |
| Module definitions need updates | Low | Maintain backward compatibility; provide migration path |
| Performance worse than Python | Medium | Profile early; optimize hot paths; consider native modules |
| Breaking changes during development | Medium | Semantic versioning; clear deprecation notices |

## 19. References

- **Python Implementation:** Current codebase in repository root
- **Module Definitions:** `modules/**/*.yml` files
- **Bun Documentation:** https://bun.sh/docs
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Hono Framework:** https://hono.dev/
- **Server-Sent Events:** https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- **Docker API:** https://docs.docker.com/engine/api/
- **nginx Configuration:** https://nginx.org/en/docs/

---

## Next Steps

1. **Review & Feedback** - Stakeholder review of this requirements document
2. **Technical Spike** - Prototype SSE implementation with real Docker operations
3. **Architecture Design** - Create detailed component diagrams and interfaces
4. **Development Kickoff** - Begin Phase 1 implementation
