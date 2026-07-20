# Architecture Overview

This document describes Katana's system design for contributors and developers.

## High-Level Architecture

Katana is a single-process application that serves as both a CLI tool and a reverse proxy server:

```
                              ┌─────────────────────────────────────┐
                              │            Katana Process           │
                              │                                     │
User Request                  │  ┌─────────┐    ┌───────────────┐  │
https://dvwa.samurai.wtf ───────▶│  Proxy  │───▶│ Docker Network│  │
                              │  │ Router  │    │  (katana-net) │  │
                              │  └─────────┘    └───────┬───────┘  │
                              │       │                 │          │
                              │       ▼                 ▼          │
                              │  ┌─────────┐    ┌─────────────┐   │
https://katana.samurai.wtf ─────▶│Dashboard│    │  Containers │   │
                              │  │   UI    │    │ DVWA, Juice │   │
                              │  └─────────┘    │  Shop, etc  │   │
                              │                 └─────────────┘   │
                              └─────────────────────────────────────┘
```

## Core Components

### CLI Entry Point (`src/cli.ts`)

The command-line interface built with [Commander.js](https://github.com/tj/commander.js):

- Parses command-line arguments
- Routes to appropriate command handlers
- Provides help and version information

### Server (`src/server.ts`)

The HTTPS reverse proxy and web dashboard server:

- Binds to ports 443 (HTTPS) and 80 (HTTP redirect)
- Routes requests based on hostname
- Serves the web dashboard UI
- Provides REST API endpoints

### Core Managers (`src/core/`)

| Manager | File | Responsibility |
|---------|------|----------------|
| **ConfigManager** | `config-manager.ts` | Load/save `config.yml`, provide defaults |
| **StateManager** | `state-manager.ts` | Load/save `state.yml`, atomic writes, lock state |
| **ModuleLoader** | `module-loader.ts` | Scan and validate module definitions |
| **ComposeManager** | `compose-manager.ts` | Docker Compose operations (up, down, status) |
| **CertManager** | `cert-manager.ts` | Certificate generation and management |
| **ProxyRouter** | `proxy-router.ts` | Hostname-to-container routing |
| **DockerClient** | `docker-client.ts` | Docker API wrapper |

### Platform Layer (`src/platform/`)

Abstractions for platform-specific operations:

```
src/platform/
├── index.ts              # Platform detection
├── types.ts              # Interface definitions
└── linux/
    └── dns-manager.ts    # /etc/hosts management
```

Currently Linux-only; structure allows future Windows support.

### Types (`src/types/`)

TypeScript types and Zod schemas:

| File | Contents |
|------|----------|
| `config.ts` | Configuration types and schema |
| `state.ts` | State file types and schema |
| `module.ts` | Module definition types and schema |
| `docker.ts` | Docker-related types |
| `errors.ts` | Custom error classes |

### UI (`src/ui/`)

React-based web dashboard:

- Built with React + Tailwind CSS + shadcn/ui
- Bundled into the executable
- Served from memory (no external files needed)

## Data Flow

### Request Routing

```
1. Request arrives at port 443
   └─▶ https://dvwa.samurai.wtf/login

2. Server extracts hostname
   └─▶ "dvwa.samurai.wtf"

3. ProxyRouter looks up route
   └─▶ { containerName: "katana-dvwa-dvwa-1", port: 80 }

4. Resolve container IP on katana-net
   └─▶ "172.18.0.3"

5. Forward request to container
   └─▶ http://172.18.0.3:80/login

6. Return response to client
```

### Target Lifecycle

```
Install:
┌─────────────────────────────────────────────────────────┐
│ 1. Load module definition (module.yml)                  │
│ 2. Ensure katana-net network exists                     │
│ 3. Run docker compose up -d                             │
│ 4. Register proxy routes in state                       │
│ 5. Save state                                           │
│ 6. Remind user to sync DNS                              │
└─────────────────────────────────────────────────────────┘

Start/Stop:
┌─────────────────────────────────────────────────────────┐
│ docker compose start/stop                               │
└─────────────────────────────────────────────────────────┘

Remove:
┌─────────────────────────────────────────────────────────┐
│ 1. Run docker compose down                              │
│ 2. Remove routes from state                             │
│ 3. Save state                                           │
└─────────────────────────────────────────────────────────┘
```

## File Locations

### User Configuration

| File | Location | Purpose |
|------|----------|---------|
| Config | `~/.config/katana/config.yml` | User configuration |
| State | `~/.local/share/katana/state.yml` | Installation state |
| Certs | `~/.local/share/katana/certs/` | CA and server certificates |

### Project Structure

```
katana/
├── src/
│   ├── cli.ts                 # CLI entry point
│   ├── server.ts              # Web server + proxy
│   ├── commands/              # CLI command implementations
│   ├── core/                  # Business logic managers
│   ├── platform/              # Platform-specific code
│   ├── types/                 # TypeScript types + schemas
│   ├── utils/                 # Utility functions
│   ├── ui/                    # React dashboard
│   └── server/                # API route handlers
├── modules/
│   ├── targets/               # Target module definitions
│   └── tools/                 # Tool module definitions
├── tests/
│   └── e2e/                   # End-to-end test scripts
└── docs/                      # Documentation
```

## Key Design Decisions

### Single Process Model

The CLI and proxy server run in the same process. This simplifies:
- State management (no IPC needed)
- Deployment (single binary)
- Route updates (immediate, no restart needed)

### Docker Compose Over Direct Docker API

We use `docker compose` CLI commands rather than direct API calls because:
- Compose handles multi-container orchestration
- Health checks and dependencies work out of the box
- Familiar format for contributors

### Shared Docker Network

All targets join the `katana-net` external network:
- Proxy can reach any container by name
- Containers can communicate if needed
- No port allocation conflicts

### State File as Cache

The state file (`state.yml`) caches installation metadata:
- Docker is source of truth for container status
- State tracks what Katana installed (vs. unrelated containers)
- Enables quick status checks without querying Docker

### Self-Signed CA

Certificates are self-signed rather than using Let's Encrypt:
- Works for local development (no public domain needed)
- Consistent across local and remote deployments
- Users explicitly trust the CA (security-conscious approach)

## API Routes

The server exposes REST API endpoints for the dashboard:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/modules` | List all modules |
| GET | `/api/modules/:name` | Get module details |
| POST | `/api/modules/:name/install` | Install module |
| POST | `/api/modules/:name/remove` | Remove module |
| POST | `/api/modules/:name/start` | Start module |
| POST | `/api/modules/:name/stop` | Stop module |
| GET | `/api/system` | System status |
| GET | `/api/certs/ca` | Download CA certificate |
| GET | `/api/operations/:id/stream` | SSE stream for operation progress |

## Testing

### Automated Tests

End-to-end tests in `tests/e2e/`:

| Script | Tests |
|--------|-------|
| `build.sh` | TypeScript compilation, linting, binary build |
| `cli.sh` | CLI commands work correctly |
| `state.sh` | State file management |
| `lifecycle.sh` | Target install/start/stop/remove |
| `api.sh` | REST API endpoints |
| `proxy.sh` | Reverse proxy routing |

Run all tests:
```bash
./tests/e2e/run-all.sh
```

### Manual Testing

The dashboard UI and browser certificate import require manual testing. See [Development Guide](development-guide.md).

## Dependencies

### Runtime

| Package | Purpose |
|---------|---------|
| commander | CLI framework |
| zod | Schema validation |
| yaml | YAML parsing |

### Build-time

| Package | Purpose |
|---------|---------|
| bun | Runtime, bundler, test runner |
| biome | Linter and formatter |
| typescript | Type checking |
| react, tailwindcss | Dashboard UI |

### System

| Dependency | Purpose |
|------------|---------|
| Docker | Container runtime |
| OpenSSL | Certificate generation |

## Future Considerations

### Windows Support

The platform abstraction layer (`src/platform/`) allows adding Windows support:
- DNS: `C:\Windows\System32\drivers\etc\hosts`
- Docker: Docker Desktop works on Windows
- Ports: May require running as Administrator

### Additional Module Types

The architecture could support:
- Kubernetes-based targets
- Remote module repositories
- Module versioning
