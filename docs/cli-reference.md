# CLI Reference

Complete reference for all Katana commands.

## Global Options

These options work with any command:

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Path to custom configuration file |
| `-h, --help` | Display help for command |
| `-V, --version` | Display version number |

## Target Management

### `katana install <name>`

Install a target or tool module.

```bash
katana install dvwa
katana install juiceshop
```

**Options:**
- `--skip-dns` - Skip the DNS update reminder

**Notes:**
- Creates and starts Docker containers for the target
- Registers proxy routes for hostname-based access
- After installing, run `sudo katana dns sync` to update `/etc/hosts`

---

### `katana remove <name>`

Remove an installed target or tool.

```bash
katana remove dvwa
```

**Notes:**
- Stops and removes Docker containers
- Removes proxy route registrations
- Does not automatically update DNS (run `sudo katana dns sync` afterward)

---

### `katana start <name>`

Start a stopped target.

```bash
katana start dvwa
```

**Notes:**
- Only works on installed targets that are currently stopped
- Use `katana status` to see current state

---

### `katana stop <name>`

Stop a running target.

```bash
katana stop dvwa
```

**Notes:**
- Containers remain installed, just stopped
- Use `katana start` to restart

---

### `katana status`

Show system status overview.

```bash
katana status
```

**Output includes:**
- Lock state
- Installation type and domain
- Number of installed/running targets
- List of targets with their status (running/stopped)
- Configuration file locations

---

### `katana logs <name>`

View logs from a target's containers.

```bash
# Show last 100 lines
katana logs dvwa

# Follow log output (like tail -f)
katana logs -f dvwa

# Show last 50 lines
katana logs -t 50 dvwa
```

**Options:**
- `-f, --follow` - Follow log output in real-time
- `-t, --tail <lines>` - Number of lines to show (default: 100)

---

### `katana list [category]`

List available modules.

```bash
# List all modules
katana list

# List only targets
katana list targets

# List only tools
katana list tools

# Show only installed modules
katana list --installed
```

**Options:**
- `--installed` - Show only installed modules

**Output shows:**
- Module name
- Description
- Installation status (`[installed]` marker)

---

## System Management

### `katana lock`

Lock the system to prevent modifications.

```bash
katana lock
```

**Notes:**
- Prevents `install` and `remove` operations
- Useful for classroom environments where instructors set up labs
- Use `katana unlock` to re-enable modifications

---

### `katana unlock`

Unlock the system to allow modifications.

```bash
katana unlock
```

---

### `katana doctor`

Run health checks on the system.

```bash
katana doctor

# Output as JSON (for scripting)
katana doctor --json
```

**Options:**
- `--json` - Output results as JSON

**Checks performed:**
1. Docker daemon running
2. User has Docker permissions
3. Docker network exists
4. OpenSSL available
5. Certificates initialized
6. Certificates valid (with expiration warning)
7. Port 443 capability
8. DNS entries in sync
9. State file valid

**Exit codes:**
- `0` - All checks passed
- `1` - One or more checks failed

---

### `katana cleanup`

Remove orphaned resources and fix inconsistencies.

```bash
# Show what would be cleaned up
katana cleanup --dry-run

# Run cleanup
katana cleanup

# Also prune unused Docker images
katana cleanup --prune
```

**Options:**
- `--dry-run` - Show what would be done without making changes
- `--prune` - Also prune unused Docker images

**Actions performed:**
- Remove orphaned containers (from deleted targets)
- Report DNS sync status
- Optionally prune unused Docker images

---

## Proxy Management

### `katana proxy start`

Start the reverse proxy server.

```bash
katana proxy start
```

**Notes:**
- Runs in foreground (use Ctrl+C to stop)
- Listens on ports 443 (HTTPS) and 80 (HTTP redirect)
- Serves the web dashboard at `https://katana.<domain>`
- Proxies requests to target containers based on hostname

For background operation, use a process manager like systemd. See [Deployment Guide](deployment-guide.md).

---

### `katana proxy status`

Show proxy configuration and registered routes.

```bash
katana proxy status
```

**Output includes:**
- HTTPS and HTTP ports
- Dashboard URL
- Docker network name
- List of configured routes (hostname → container mapping)

---

## DNS Management

### `katana dns sync`

Synchronize `/etc/hosts` with target hostnames.

```bash
# Sync hostnames for installed targets only
sudo katana dns sync

# Sync hostnames for ALL available targets
sudo katana dns sync --all
```

**Options:**
- `--all` - Sync all available targets, not just installed ones

**Requires:** sudo (writes to `/etc/hosts`)

**Notes:**
- Adds entries with `# katana-managed` marker
- Preserves non-Katana entries
- Idempotent (safe to run multiple times)
- For remote installations, use wildcard DNS instead

---

### `katana dns list`

List DNS entries from `/etc/hosts`.

```bash
# Show Katana-managed entries only
katana dns list

# Show all entries
katana dns list --all
```

**Options:**
- `--all` - Show all entries, not just Katana-managed

---

## Certificate Management

### `katana cert init`

Initialize the Certificate Authority and generate server certificates.

```bash
katana cert init
```

**Notes:**
- Creates a self-signed CA (valid 10 years)
- Generates wildcard server certificate (valid 1 year)
- Certificates stored in `~/.local/share/katana/certs/`
- If CA already exists, keeps CA and regenerates server certificate

---

### `katana cert renew`

Renew the server certificate (keeps existing CA).

```bash
katana cert renew
```

**Notes:**
- Keeps the existing CA (no need to re-import in browsers)
- Generates new server certificate (valid 1 year)
- Use when certificate is expiring

---

### `katana cert export [path]`

Export the CA certificate for browser import.

```bash
# Export to current directory
katana cert export

# Export to specific path
katana cert export /tmp/katana-ca.crt
```

**Arguments:**
- `[path]` - Destination path (default: `./ca.crt`)

**Notes:**
- Creates a copy of the CA certificate
- Import this file into your browser to trust Katana's HTTPS certificates

---

### `katana cert status`

Show certificate status and expiration.

```bash
katana cert status
```

**Output includes:**
- CA initialization status
- Server certificate validity
- Days until expiration
- Certificate file location

---

## Setup Commands

### `katana setup-proxy`

Configure the system for proxy operation.

```bash
sudo katana setup-proxy
```

**Requires:** sudo

**Actions performed:**
- Sets `cap_net_bind_service` capability on the binary
- This allows binding to ports 443 and 80 without running as root

**Notes:**
- Only needs to be run once after installation
- Must be re-run if the binary is replaced (e.g., after updates)

---

## Common Workflows

### First-time Setup

```bash
katana cert init           # Generate certificates
sudo katana setup-proxy    # Enable port 443 binding
sudo katana dns sync --all # Add all hostnames to /etc/hosts
```

### Install and Use a Target

```bash
katana install dvwa        # Install the target
katana proxy start         # Start the proxy (foreground)
# Visit https://dvwa.samurai.wtf in browser
```

### Classroom Setup (Instructor)

```bash
# Install desired targets
katana install dvwa
katana install juiceshop
katana install webgoat

# Lock system to prevent student modifications
katana lock

# Start proxy
katana proxy start
```

### Check System Health

```bash
katana doctor              # Run all health checks
katana status              # Quick status overview
katana proxy status        # Show proxy routes
```

### Maintenance

```bash
katana cleanup --dry-run   # See what would be cleaned
katana cleanup --prune     # Clean up and prune images
katana cert renew          # Renew expiring certificate
```
