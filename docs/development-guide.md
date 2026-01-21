# Development Guide

This guide covers setting up a development environment and contributing code to Katana.

## Prerequisites

### Required

- **Bun** (latest) - JavaScript runtime and toolkit
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

- **Docker Engine 20.10+** with Docker Compose V2
  ```bash
  docker --version
  docker compose version
  ```

- **Git**

### Recommended

- **VS Code** with extensions:
  - Biome (linting/formatting)
  - TypeScript
  - Docker

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/SamuraiWTF/katana2.git
cd katana2
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Run from Source

```bash
# Run CLI commands directly
bun run src/cli.ts --help
bun run src/cli.ts status
bun run src/cli.ts list

# Run with hot reload (for server development)
bun --hot src/cli.ts proxy start
```

### 4. Build the Binary

```bash
bun build --compile src/cli.ts --outfile bin/katana
```

The compiled binary is at `bin/katana`.

## Project Structure

```
katana/
├── src/
│   ├── cli.ts                 # CLI entry point
│   ├── server.ts              # Web server + reverse proxy
│   ├── commands/              # CLI command implementations
│   │   ├── install.ts
│   │   ├── remove.ts
│   │   └── ...
│   ├── core/                  # Business logic
│   │   ├── config-manager.ts
│   │   ├── state-manager.ts
│   │   ├── module-loader.ts
│   │   ├── compose-manager.ts
│   │   ├── cert-manager.ts
│   │   ├── proxy-router.ts
│   │   └── docker-client.ts
│   ├── platform/              # Platform-specific code
│   │   └── linux/
│   ├── types/                 # TypeScript types + Zod schemas
│   ├── utils/                 # Utility functions
│   ├── ui/                    # React dashboard
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── hooks/
│   └── server/                # API route handlers
│       └── routes/
├── modules/                   # Module definitions
│   ├── targets/
│   └── tools/
├── tests/
│   └── e2e/                   # End-to-end tests
├── docs/                      # Documentation
├── package.json
├── tsconfig.json
└── biome.json
```

## Development Workflow

### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes

3. Run type checking:
   ```bash
   bunx tsc --noEmit
   ```

4. Run linting:
   ```bash
   bunx biome check src/
   ```

5. Fix formatting:
   ```bash
   bunx biome format --write src/
   ```

6. Run tests:
   ```bash
   ./tests/e2e/run-all.sh
   ```

### Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
bunx biome check src/

# Fix auto-fixable issues
bunx biome check --apply src/

# Format code
bunx biome format --write src/
```

Configuration is in `biome.json`.

### TypeScript

- Strict mode is enabled
- Use Zod for runtime validation
- Prefer explicit types for public APIs

```typescript
// Good: explicit return type
async function loadModule(name: string): Promise<Module> {
  // ...
}

// Good: use Zod for validation
const result = ModuleSchema.parse(data);
```

## Testing

### Automated E2E Tests

The test suite is in `tests/e2e/`:

```bash
# Run all tests
./tests/e2e/run-all.sh

# Run individual test
./tests/e2e/build.sh    # Build verification
./tests/e2e/cli.sh      # CLI commands
./tests/e2e/state.sh    # State management
./tests/e2e/lifecycle.sh # Target lifecycle
./tests/e2e/api.sh      # API endpoints (requires proxy)
./tests/e2e/proxy.sh    # Proxy routing (requires proxy)
```

### Manual Testing Checklist

Some features require manual testing:

- [ ] Dashboard loads at `https://katana.samurai.wtf`
- [ ] Install target via dashboard
- [ ] Start/stop target via dashboard
- [ ] Remove target via dashboard
- [ ] Theme toggle (dark/light)
- [ ] CA certificate download
- [ ] Certificate import in browser (Firefox, Chrome)
- [ ] Target accessible after cert import

### Writing Tests

For new features, add test cases to the appropriate E2E script or create a new script following the existing pattern.

## Building

### Development Build

```bash
bun build --compile src/cli.ts --outfile bin/katana
```

### UI Build

The UI is built separately and embedded:

```bash
# Build UI assets
bun run src/ui/build.ts

# Then build the binary
bun build --compile src/cli.ts --outfile bin/katana
```

### After Building

After building a new binary, you need to re-apply setcap for privileged port binding:

```bash
sudo setcap cap_net_bind_service=+ep ./bin/katana
```

## Common Development Tasks

### Adding a New CLI Command

1. Create command file in `src/commands/`:
   ```typescript
   // src/commands/mycommand.ts
   export async function myCommand(args: MyArgs): Promise<void> {
     // Implementation
   }
   ```

2. Register in `src/cli.ts`:
   ```typescript
   program
     .command("mycommand")
     .description("Description")
     .action(async () => {
       await myCommand();
     });
   ```

### Adding a New API Endpoint

1. Add route handler in `src/server/routes/`

2. Register in `src/server.ts` route handling

### Adding a New Target Module

See [Module Development Guide](module-development.md).

### Modifying the Dashboard

1. Edit components in `src/ui/components/`
2. Test with hot reload: `bun --hot src/cli.ts proxy start`
3. Rebuild: `bun run src/ui/build.ts`

## Debugging

### CLI Debugging

```bash
# Run with debug output
DEBUG=* bun run src/cli.ts status
```

### Container Debugging

```bash
# Check container status
docker ps -a | grep katana

# View container logs
docker logs katana-dvwa-dvwa-1

# Inspect container
docker inspect katana-dvwa-dvwa-1

# Shell into container
docker exec -it katana-dvwa-dvwa-1 /bin/sh
```

### Proxy Debugging

```bash
# Test proxy routing manually
curl -k -H "Host: dvwa.samurai.wtf" https://localhost/

# Check what's listening on port 443
sudo lsof -i :443
```

## Pull Request Guidelines

### Before Submitting

1. **Type check passes:** `bunx tsc --noEmit`
2. **Lint passes:** `bunx biome check src/`
3. **Tests pass:** `./tests/e2e/run-all.sh`
4. **Manual testing** done for UI changes

### PR Description

Include:
- What the change does
- Why it's needed
- How to test it
- Screenshots for UI changes

### Commit Messages

Use clear, descriptive commit messages:

```
Add certificate renewal reminder to doctor command

- Check certificate expiration in doctor command
- Warn if certificate expires within 30 days
- Add help message with renewal instructions
```

## Getting Help

- **Architecture questions:** See [Architecture](architecture.md)
- **Module development:** See [Module Development](module-development.md)
- **Issues:** Open a [GitHub issue](https://github.com/SamuraiWTF/katana2/issues)
