# Katana Bun/TypeScript Implementation Plan

## Overview

This document outlines the phased implementation plan for reimplementing Katana in Bun/TypeScript. The implementation lives in the `bun/` directory, coexisting with the Python implementation during development.

### Coexistence Strategy

- **Development**: TypeScript code lives in `bun/`, Python remains in repository root
- **Shared**: Both implementations read from the same `modules/` directory
- **State Files**: Both use compatible formats for `installed.yml` and `katana.lock`
- **Transition**: Eventually the compiled Bun binary replaces `katanacli.py`

### Testing Environment Notes

Development is on Chromebook Linux where some integrations (systemd, Docker) may not be available. The plan includes mock implementations for testing, with full integration testing deferred to a proper Linux environment.

---

## Phase 1: Project Foundation & Core Types

**Goal:** Establish project structure, type definitions, YAML validation, and basic CLI skeleton

### 1.1 Project Setup
- [ ] Initialize Bun project with TypeScript strict mode
- [ ] Configure `tsconfig.json`, `bunfig.toml`
- [ ] Set up Biome for linting/formatting
- [ ] Create directory structure
- [ ] Set up Bun test runner

### 1.2 Type Definitions & Zod Schemas (`src/types/`)
- [ ] `Module` schema - YAML structure validation with Zod
- [ ] `Plugin` interface and base types
- [ ] `Task` types for install/remove/start/stop operations
- [ ] `ModuleStatus` enum (not_installed, installed, stopped, running, blocked, unknown)
- [ ] `Config` schema matching config.yml structure
- [ ] `SSEEvent` types for streaming
- [ ] Export inferred TypeScript types from Zod schemas

### 1.3 YAML Module Loader (`src/core/`)
- [ ] `ModuleLoader` - scan `../modules/` directory for YAML files
- [ ] YAML parsing with `yaml` package
- [ ] Zod schema validation with human-friendly error messages
- [ ] Graceful error handling for malformed YAML
- [ ] Include source file path and line numbers in errors where possible

### 1.4 CLI Skeleton (`src/cli/`)
- [ ] Main entry point (`src/cli.ts`)
- [ ] Command routing using `commander`
- [ ] Implement commands:
  - `katana list [category]` - List available modules
  - `katana status <module>` - Check module status (stub)
  - `katana validate <file>` - Validate YAML syntax and schema
- [ ] Stub remaining commands: init, install, remove, start, stop, lock, unlock, update

### 1.5 Tests
- [ ] Zod schema tests (valid and invalid module structures)
- [ ] YAML parsing tests against existing module files in `../modules/`
- [ ] Validation error message tests
- [ ] CLI argument parsing tests

**Testable Milestone:**
```bash
cd bun
bun run src/cli.ts list                    # Shows parsed module names
bun run src/cli.ts list targets            # Filter by category
bun run src/cli.ts validate ../modules/targets/dvwa.yml  # Validates OK
bun run src/cli.ts validate bad-module.yml # Shows helpful errors
bun test                                   # All unit tests pass
```

---

## Phase 2: Configuration & State Management

**Goal:** Implement configuration loading, state persistence, and lock mode

### 2.1 Configuration System (`src/core/config.ts`)
- [ ] Zod schema for configuration
- [ ] Load config from `/etc/katana/config.yml` or `~/.config/katana/config.yml`
- [ ] Default config values with sensible defaults
- [ ] `katana init` command - interactive config generation
- [ ] Non-interactive mode: `katana init --non-interactive --domain-base=wtf`

### 2.2 State Persistence (`src/core/state.ts`)
- [ ] Read/write `installed.yml` (backward compatible format)
- [ ] Atomic file writes (write to temp file, then rename)
- [ ] File locking for concurrent access prevention

### 2.3 Lock Mode (`src/core/lock.ts`)
- [ ] Read/write `katana.lock` file
- [ ] Support legacy format (newline-separated module list)
- [ ] Support new YAML format with metadata (locked_at, locked_by, message)
- [ ] Auto-migration from legacy to new format on first write
- [ ] Lock state checking functions

### 2.4 CLI Commands
- [ ] `katana init` - generate config file interactively
- [ ] `katana lock [--message "..."]` - enable lock mode
- [ ] `katana unlock` - disable lock mode (requires appropriate permissions)
- [ ] `katana list` - respect lock mode (only show installed modules when locked)

### 2.5 Tests
- [ ] Config loading/validation tests
- [ ] Config default value tests
- [ ] State file read/write tests
- [ ] Atomic write tests
- [ ] Lock mode behavior tests
- [ ] Lock file format migration tests

**Testable Milestone:**
```bash
bun run src/cli.ts init                    # Creates config file
bun run src/cli.ts lock --message "Test"   # Creates lock file
bun run src/cli.ts list                    # Shows only locked modules
bun run src/cli.ts unlock                  # Removes lock
bun test
```

---

## Phase 3: Plugin Architecture & Mock Plugins

**Goal:** Build the plugin system with testable mock implementations

### 3.1 Plugin System (`src/plugins/`)
- [ ] `IPlugin` interface with install/remove/start/stop/exists/started methods
- [ ] `BasePlugin` abstract class with exec helper, param validation
- [ ] Plugin registry - discover and register plugins by alias
- [ ] Plugin parameter validation using Zod schemas

### 3.2 Core Plugins (with mock mode for testing)

| Plugin | Real Implementation | Mock Mode |
|--------|---------------------|-----------|
| `Command` | `Bun.spawn()` | Log command, return success |
| `File` | `fs.mkdir` | Track created dirs in memory |
| `Copy` | `Bun.write()` | Track written files in memory |
| `LineInFile` | Read/modify/write file | In-memory file tracking |
| `Git` | `git clone` via spawn | Log clone URL, simulate success |

### 3.3 Docker Plugin
- [ ] Real: Use `Bun.spawn('docker', [...])` for Docker CLI
- [ ] Mock: Track container states in memory
- [ ] Methods: install (pull/create), remove, start, stop
- [ ] Status methods: exists, started

### 3.4 Service Plugin
- [ ] Real: `systemctl` commands via spawn
- [ ] Mock: Track service states in memory
- [ ] Methods: start, stop, restart
- [ ] Handle `state: running` vs `state: restarted`

### 3.5 Task Executor (`src/core/executor.ts`)
- [ ] `TaskExecutor` class - execute task lists from module YAML
- [ ] Find plugin by task key (docker, service, lineinfile, etc.)
- [ ] Sequential task execution with error handling
- [ ] EventEmitter for progress events (preparation for SSE)
- [ ] Error context: which task failed, what module, what operation

### 3.6 Environment Detection
- [ ] `KATANA_MOCK=true` environment variable enables mock mode
- [ ] Auto-detect missing Docker/systemd and warn or use mocks

### 3.7 Tests
- [ ] Plugin registration and lookup tests
- [ ] Each plugin's mock mode unit tests
- [ ] TaskExecutor tests with mock plugins
- [ ] Full module install/remove simulation with mocks
- [ ] Error handling and rollback tests

**Testable Milestone:**
```bash
KATANA_MOCK=true bun run src/cli.ts install dvwa   # Executes tasks with mocks
KATANA_MOCK=true bun run src/cli.ts status dvwa    # Shows "installed"
KATANA_MOCK=true bun run src/cli.ts start dvwa     # Starts container (mock)
KATANA_MOCK=true bun run src/cli.ts status dvwa    # Shows "running"
bun test
```

---

## Phase 4: Dependency Resolution & Status Checking

**Goal:** Implement dependency graph and real status checks

### 4.1 Dependency Resolution (`src/core/dependencies.ts`)
- [ ] Build dependency graph from all modules (`depends-on` field)
- [ ] Circular dependency detection with clear error messages
- [ ] Topological sort for installation order
- [ ] Resolve and install dependencies before target module

### 4.2 Status Checking (`src/core/status.ts`)
- [ ] Parse `status.running.started` checks from module YAML
- [ ] Parse `status.installed.exists` checks
- [ ] Execute status checks via Exists/Started plugins
- [ ] Status hierarchy: running > stopped/installed > not_installed
- [ ] Status caching with configurable TTL (default 5 seconds)

### 4.3 Exists Plugin (`src/plugins/exists.ts`)
- [ ] Check Docker container exists: `docker ps -a --filter name=X`
- [ ] Check file/directory exists: `fs.stat()`
- [ ] Check path exists (generic)

### 4.4 Started Plugin (`src/plugins/started.ts`)
- [ ] Check Docker container running: `docker ps --filter name=X --filter status=running`
- [ ] Check service running: `systemctl is-active X`

### 4.5 Enhanced CLI Commands
- [ ] `katana status <module>` - real status checks
- [ ] `katana list` - parallel status checks, show status column
- [ ] `katana install <module>` - resolve and install dependencies first
- [ ] `katana remove <module>` - warn if other modules depend on it

### 4.6 Tests
- [ ] Dependency graph construction tests
- [ ] Circular dependency detection tests
- [ ] Topological sort tests
- [ ] Status check logic tests (with mocks)
- [ ] End-to-end install with dependencies (mocked)

**Testable Milestone:**
```bash
bun run src/cli.ts list --status           # Shows status for all modules
bun run src/cli.ts status dvwa             # Real status check (if Docker available)
bun run src/cli.ts install dojo-basic      # Installs dependencies first
bun test
```

---

## Phase 5: Web Server & REST API

**Goal:** Implement HTTP server with REST endpoints and SSE streaming

### 5.1 HTTP Server Setup (`src/server/`)
- [ ] Hono framework setup with Bun.serve
- [ ] Static file serving for UI assets (from `src/ui/dist/` or `../html/`)
- [ ] CORS configuration for development
- [ ] Error handling middleware
- [ ] Request logging with pino

### 5.2 REST API Endpoints

```
GET    /api/modules              → List all modules with status
GET    /api/modules/:category    → List by category (targets, tools, base)
GET    /api/modules/:name        → Single module details
POST   /api/modules/:name/install → Install module (returns operationId)
POST   /api/modules/:name/remove  → Remove module
POST   /api/modules/:name/start   → Start module
POST   /api/modules/:name/stop    → Stop module
GET    /api/modules/:name/status  → Get module status

GET    /api/config               → Get current configuration
GET    /api/lock                 → Get lock status
POST   /api/lock                 → Enable lock mode
DELETE /api/lock                 → Disable lock mode

GET    /health                   → Health check
```

### 5.3 Operation Queue (`src/server/operations.ts`)
- [ ] Generate operation IDs (crypto.randomUUID)
- [ ] Track running operations in memory
- [ ] Prevent concurrent operations on same module
- [ ] Configurable max concurrent operations (default: 3)
- [ ] Operation timeout handling

### 5.4 SSE Streaming (`src/server/sse.ts`)
- [ ] `GET /api/operations/:operationId/stream` endpoint
- [ ] Stream progress events during install/remove/start/stop
- [ ] Event types: progress, log, status, complete, error
- [ ] Connection cleanup on client disconnect
- [ ] Heartbeat to keep connection alive

### 5.5 Lock Mode Integration
- [ ] API respects lock state
- [ ] Return 403 Forbidden for install/remove when locked
- [ ] Include lock status and message in responses
- [ ] Lock indicator in module list response

### 5.6 Tests
- [ ] API endpoint tests with Bun test + fetch
- [ ] SSE streaming tests
- [ ] Concurrent operation rejection tests
- [ ] Lock mode API tests
- [ ] Error response format tests

**Testable Milestone:**
```bash
bun run src/cli.ts serve &                  # Start server on :8087
curl http://localhost:8087/health
curl http://localhost:8087/api/modules
curl http://localhost:8087/api/modules/dvwa
curl -X POST http://localhost:8087/api/modules/dvwa/install
# Stream in another terminal:
curl -N http://localhost:8087/api/operations/{id}/stream
bun test
```

---

## Phase 6: Web UI & Production Polish

**Goal:** Modern React UI with real-time updates and production-ready binary

### 6.1 Frontend Setup (`src/ui/`)
- [ ] Vite + React + TypeScript project
- [ ] shadcn/ui installation and configuration
- [ ] TailwindCSS setup
- [ ] Build output to `dist/` for embedding in binary

### 6.2 UI Components
- [ ] Module list view grouped by category (accordion or tabs)
- [ ] Module card with status indicator (colored badge)
- [ ] Action buttons based on state (Install/Remove/Start/Stop/Open)
- [ ] "Open" button for modules with `href` (disabled when not running)
- [ ] Lock mode indicator (banner with message)
- [ ] Base domain display in header/footer

### 6.3 Real-time Updates
- [ ] SSE client hook for operation progress
- [ ] Live log streaming in modal/drawer
- [ ] Progress bar for multi-step operations
- [ ] Auto-refresh status on operation complete
- [ ] Error display with details

### 6.4 Remaining Plugins
- [ ] `ReverseProxy` - nginx config generation, SSL cert creation with openssl
- [ ] `GetUrl` - HTTP downloads with fetch, progress tracking
- [ ] `Unarchive` - tar/zip extraction via CLI
- [ ] `DesktopIntegration` - skip gracefully in headless environments
- [ ] `Replace` - file content replacement
- [ ] `Remove` - file/directory removal
- [ ] `Yarn` - yarn command execution (for tools like dojo)

### 6.5 Production Build
- [ ] Binary compilation: `bun build --compile`
- [ ] Embed static UI assets in binary
- [ ] Structured logging with pino (JSON format)
- [ ] Log file configuration and rotation
- [ ] Graceful shutdown (SIGTERM/SIGINT handling)
- [ ] `--version` flag

### 6.6 CLI Polish
- [ ] Colored output (chalk or similar)
- [ ] Progress spinners for long operations
- [ ] `--json` flag for machine-readable output
- [ ] `--quiet` / `--verbose` flags

### 6.7 Tests
- [ ] UI component tests with Vitest
- [ ] E2E tests with real modules (deferred to full Linux environment)

**Testable Milestone:**
```bash
bun run build                              # Compiles to single binary
./katana --version                         # Shows version
./katana serve &                           # Binary works standalone
# Open http://localhost:8087 in browser - full UI works
# Install a module via UI, watch progress stream
```

---

## Testing Strategy

### Chromebook Linux (Development Environment)
- All unit tests with mock plugins
- API integration tests with mocks
- UI development and component tests
- YAML validation against real module files
- No real Docker/systemd integration

### Full Linux Environment (CI/Production Testing)
- Integration tests with real Docker daemon
- systemd service management tests
- nginx configuration and SSL certificate tests
- E2E tests installing actual modules (dvwa, juice-shop)
- Lock mode with real file permissions

---

## Plugin Implementation Priority

Based on analysis of existing module YAML files:

| Priority | Plugin | Used By | Notes |
|----------|--------|---------|-------|
| P0 | Docker | All targets | Core functionality |
| P0 | Service | All targets | systemctl control |
| P0 | LineInFile | All targets | /etc/hosts management |
| P0 | ReverseProxy | All targets | nginx + SSL |
| P1 | Command | Several tools | Shell execution |
| P1 | File | Directory creation | Simple fs.mkdir |
| P1 | Copy | Config files | File writing |
| P1 | Git | Some tools | Repository cloning |
| P1 | Exists | Status checks | Resource existence |
| P1 | Started | Status checks | Running state |
| P2 | GetUrl | Downloads | HTTP fetch |
| P2 | Unarchive | Extractions | tar/zip |
| P2 | Replace | Config edits | String replacement |
| P2 | Remove | Cleanup | File deletion |
| P3 | DesktopIntegration | Desktop shortcuts | Skip in headless |
| P3 | Yarn | Node.js tools | Package management |

---

## Directory Structure

```
katana/
├── bun/                          # TypeScript implementation
│   ├── src/
│   │   ├── cli.ts                # CLI entry point
│   │   ├── cli/
│   │   │   ├── index.ts          # Command setup
│   │   │   └── commands/
│   │   │       ├── init.ts
│   │   │       ├── install.ts
│   │   │       ├── remove.ts
│   │   │       ├── start.ts
│   │   │       ├── stop.ts
│   │   │       ├── status.ts
│   │   │       ├── list.ts
│   │   │       ├── lock.ts
│   │   │       ├── validate.ts
│   │   │       └── serve.ts
│   │   ├── core/
│   │   │   ├── config.ts         # Configuration management
│   │   │   ├── module-loader.ts  # YAML discovery and parsing
│   │   │   ├── state.ts          # installed.yml management
│   │   │   ├── lock.ts           # Lock mode
│   │   │   ├── dependencies.ts   # Dependency resolution
│   │   │   ├── status.ts         # Status checking
│   │   │   └── executor.ts       # Task execution engine
│   │   ├── plugins/
│   │   │   ├── base.ts           # BasePlugin class
│   │   │   ├── registry.ts       # Plugin discovery/registration
│   │   │   ├── docker.ts
│   │   │   ├── service.ts
│   │   │   ├── lineinfile.ts
│   │   │   ├── reverseproxy.ts
│   │   │   ├── command.ts
│   │   │   ├── file.ts
│   │   │   ├── copy.ts
│   │   │   ├── git.ts
│   │   │   ├── geturl.ts
│   │   │   ├── unarchive.ts
│   │   │   ├── replace.ts
│   │   │   ├── remove.ts
│   │   │   ├── exists.ts
│   │   │   └── started.ts
│   │   ├── server/
│   │   │   ├── index.ts          # Hono server setup
│   │   │   ├── routes/
│   │   │   │   ├── modules.ts
│   │   │   │   ├── operations.ts
│   │   │   │   ├── config.ts
│   │   │   │   └── lock.ts
│   │   │   ├── operations.ts     # Operation queue
│   │   │   └── sse.ts            # SSE streaming helpers
│   │   ├── types/
│   │   │   ├── module.ts         # Module Zod schema + types
│   │   │   ├── plugin.ts         # Plugin interfaces
│   │   │   ├── config.ts         # Config Zod schema + types
│   │   │   ├── state.ts          # State file types
│   │   │   └── events.ts         # SSE event types
│   │   └── utils/
│   │       ├── logger.ts         # Pino logger setup
│   │       ├── shell.ts          # Bun.spawn helpers
│   │       └── fs.ts             # File system helpers
│   ├── ui/                       # React frontend (Phase 6)
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   └── hooks/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.js
│   │   └── package.json
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── types/
│   │   │   ├── core/
│   │   │   └── plugins/
│   │   ├── integration/
│   │   └── fixtures/
│   ├── package.json
│   ├── tsconfig.json
│   ├── bunfig.toml
│   ├── biome.json
│   └── IMPLEMENTATION_PLAN.md    # This file
│
├── modules/                      # Shared: existing YAML modules
│   ├── targets/
│   ├── tools/
│   └── management/
├── plugins/                      # Python plugins (reference)
├── katanacli.py                  # Python CLI (coexists during dev)
└── ...                           # Other Python files
```

---

## Dependencies

```json
{
  "dependencies": {
    "hono": "latest",
    "yaml": "latest",
    "zod": "latest",
    "commander": "latest",
    "pino": "latest"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "latest",
    "@biomejs/biome": "latest"
  }
}
```

UI dependencies (Phase 6):
- react, react-dom
- vite, @vitejs/plugin-react
- tailwindcss, postcss, autoprefixer
- shadcn/ui components (copy-paste, not a package)

---

## Success Criteria

The Bun/TypeScript implementation is complete when:

1. **Feature Parity**: All existing modules install/run without YAML modifications
2. **Performance**: Web operations complete without timeouts
3. **User Experience**: Real-time progress feedback via SSE
4. **Reliability**: Idempotent operations, proper error handling
5. **Validation**: `katana validate` catches common YAML errors with helpful messages
6. **Compatibility**: Reads existing `installed.yml` and `katana.lock` files
7. **Distribution**: Single binary with embedded UI, no runtime dependencies

---

## Next Steps

1. **Phase 1.1**: Initialize project in `bun/` directory
2. **Phase 1.2**: Define Zod schemas for module YAML
3. **Phase 1.3**: Implement module loader, test against `../modules/*.yml`
4. **Phase 1.4**: Build CLI with list, status, and validate commands
