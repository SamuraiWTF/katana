# Getting Started

This guide covers system requirements, installation, and initial setup for Katana.

## System Requirements

### Operating System

- **Linux** (required)
  - Debian/Ubuntu - Tested and recommended
  - Other distributions may work but are not officially tested

Windows and macOS are not currently supported.

### Docker

- **Docker Engine 20.10+** or Docker Desktop
- **Docker Compose V2** (included with modern Docker installations)

To verify your Docker installation:

```bash
docker --version        # Should be 20.10 or higher
docker compose version  # Should show "Docker Compose version v2.x.x"
```

If Docker Compose V2 is not available, install it:

```bash
# Debian/Ubuntu
sudo apt update
sudo apt install docker-compose-plugin
```

### OpenSSL

OpenSSL is required for certificate generation. It's pre-installed on most Linux systems.

```bash
openssl version  # Should show version info
```

If not installed:

```bash
# Debian/Ubuntu
sudo apt install openssl
```

## Installation

### Option 1: Download Pre-built Binary (Recommended)

Download the latest release from GitHub:

```bash
# Download the binary
curl -L https://github.com/SamuraiWTF/katana2/releases/latest/download/katana-linux-x64 -o katana

# Make it executable
chmod +x katana

# Move to a location in your PATH (optional)
sudo mv katana /usr/local/bin/
```

### Option 2: Build from Source

Requires [Bun](https://bun.sh/) runtime.

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Clone the repository
git clone https://github.com/SamuraiWTF/katana2.git
cd katana2

# Install dependencies
bun install

# Build the executable
bun build --compile src/cli.ts --outfile bin/katana

# The binary is now at bin/katana
```

## Initial Setup

After installation, complete these one-time setup steps:

### 1. First Run (Creates Configuration)

Run any command to initialize the configuration file:

```bash
katana --version
```

This creates `~/.config/katana/config.yml` with default settings.

### 2. Initialize Certificates

Generate the self-signed CA and server certificates:

```bash
katana cert init
```

This creates certificates in `~/.local/share/katana/certs/`.

### 3. Enable Privileged Port Binding

Katana needs to bind to ports 443 (HTTPS) and 80 (HTTP redirect). Run the setup command:

```bash
sudo katana setup-proxy
```

This uses `setcap` to grant the binary the capability to bind to privileged ports without running as root.

### 4. Configure DNS

For **local installations** (desktop/VM), sync the hosts file:

```bash
# Sync DNS for all available targets
sudo katana dns sync --all
```

This adds entries to `/etc/hosts` for all targets (e.g., `127.0.0.1 dvwa.samurai.wtf`).

For **remote installations** (cloud/server), configure wildcard DNS instead. See the [Deployment Guide](deployment-guide.md).

### 5. Import CA Certificate in Browser

Export the CA certificate and import it into your browser:

```bash
katana cert export
# Creates ca.crt in current directory
```

**Firefox:**
1. Settings → Privacy & Security → Certificates → View Certificates
2. Authorities tab → Import
3. Select `ca.crt` and trust for websites

**Chrome/Chromium:**
1. Settings → Privacy and security → Security → Manage certificates
2. Authorities tab → Import
3. Select `ca.crt` and trust for websites

## Verify Installation

Run the health check to verify everything is configured correctly:

```bash
katana doctor
```

All checks should pass:

```
Katana Health Check
===================

✓ Docker daemon running
✓ User has Docker permissions
✓ Docker network 'katana-net' exists
✓ OpenSSL available
✓ Certificates initialized
✓ Certificates valid (expires in 364 days)
✓ Port 443 bindable
✓ DNS entries in sync (8/8)
✓ State file valid

Health: 9/9 checks passed
```

## Your First Target

Install and access a vulnerable web application:

```bash
# Install DVWA (Damn Vulnerable Web Application)
katana install dvwa

# Start the proxy server
katana proxy start
```

Open your browser and visit: `https://dvwa.samurai.wtf`

The proxy runs in the foreground. Press `Ctrl+C` to stop it.

## Dashboard Access

With the proxy running, access the web dashboard at:

```
https://katana.samurai.wtf
```

From the dashboard you can:
- View all available targets
- Install, start, stop, and remove targets
- Check system status
- Download the CA certificate

## Next Steps

- [CLI Reference](cli-reference.md) - Learn all available commands
- [Deployment Guide](deployment-guide.md) - Set up for local or cloud use
- [Troubleshooting](troubleshooting.md) - Common issues and solutions
