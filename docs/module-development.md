# Module Development Guide

This guide explains how to create new target and tool modules for Katana.

## Module Types

Katana supports two types of modules:

| Type | Description | Implementation |
|------|-------------|----------------|
| **Targets** | Vulnerable web applications | Docker Compose |
| **Tools** | Security testing tools | Shell scripts |

## Target Modules

Targets are Docker-based vulnerable web applications accessed through Katana's reverse proxy.

### Directory Structure

```
modules/targets/<name>/
├── module.yml      # Module metadata and proxy configuration
└── compose.yml     # Docker Compose configuration
```

### module.yml Format

```yaml
name: example-target
category: targets
description: Short description of the target

compose: ./compose.yml

proxy:
  - hostname: example      # Subdomain (becomes example.samurai.wtf or example.domain.com)
    service: web           # Docker Compose service name
    port: 80               # Container port to proxy to

# Optional: Environment variables for compose.yml
env:
  SOME_VAR: value
```

**Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique module name (lowercase, alphanumeric, hyphens) |
| `category` | Yes | Must be `targets` |
| `description` | Yes | Brief description |
| `compose` | Yes | Path to Docker Compose file |
| `proxy` | Yes | Array of proxy route configurations |
| `env` | No | Environment variables passed to Docker Compose |

### Proxy Configuration

Each proxy entry maps a hostname to a container port:

```yaml
proxy:
  - hostname: dvwa         # https://dvwa.samurai.wtf
    service: web           # Service name in compose.yml
    port: 80               # Port the service listens on
```

**Multi-hostname targets** (like Musashi) can map multiple hostnames to different ports on the same container:

```yaml
proxy:
  - hostname: cors
    service: musashi
    port: 3021
  - hostname: api-cors
    service: musashi
    port: 3020
  - hostname: csp
    service: musashi
    port: 3041
```

### compose.yml Requirements

```yaml
services:
  web:
    image: vulnerables/web-dvwa
    networks:
      - katana-net
    # Optional: environment variables
    environment:
      - DB_HOST=db
    # NO ports: section - proxy handles external access

  # Optional: additional services (databases, etc.)
  db:
    image: mariadb:10.6
    networks:
      - katana-net
    environment:
      - MYSQL_ROOT_PASSWORD=dvwa

networks:
  katana-net:
    external: true
```

**Rules:**

1. **Must join `katana-net`** - All services must be on the external `katana-net` network
2. **No published ports** - Do not use `ports:` section; the proxy handles external access
3. **Use official/trusted images** - Prefer images from Docker Hub official repositories or verified publishers

### Environment Variable Templating

The `env` section in `module.yml` is passed to Docker Compose. You can use this for runtime configuration:

**module.yml:**
```yaml
env:
  API_HOST: api.samurai.wtf
  CLIENT_HOST: client.samurai.wtf
```

**compose.yml:**
```yaml
services:
  app:
    image: example/app
    environment:
      - API_URL=https://${API_HOST}
      - CLIENT_URL=https://${CLIENT_HOST}
```

### Example: Simple Target (Juice Shop)

**modules/targets/juiceshop/module.yml:**
```yaml
name: juiceshop
category: targets
description: OWASP Juice Shop - Modern vulnerable web application

compose: ./compose.yml

proxy:
  - hostname: juiceshop
    service: juiceshop
    port: 3000
```

**modules/targets/juiceshop/compose.yml:**
```yaml
services:
  juiceshop:
    image: bkimminich/juice-shop
    networks:
      - katana-net

networks:
  katana-net:
    external: true
```

### Example: Target with Database (DVWA)

**modules/targets/dvwa/module.yml:**
```yaml
name: dvwa
category: targets
description: Damn Vulnerable Web Application - OWASP Top 10 training

compose: ./compose.yml

proxy:
  - hostname: dvwa
    service: dvwa
    port: 80
```

**modules/targets/dvwa/compose.yml:**
```yaml
services:
  dvwa:
    image: ghcr.io/digininja/dvwa:latest
    depends_on:
      - db
    environment:
      - DB_SERVER=db
    networks:
      - katana-net

  db:
    image: mariadb:10.6
    environment:
      - MYSQL_ROOT_PASSWORD=dvwa
      - MYSQL_DATABASE=dvwa
      - MYSQL_USER=dvwa
      - MYSQL_PASSWORD=dvwa
    networks:
      - katana-net

networks:
  katana-net:
    external: true
```

### Example: Multi-Hostname Target (Musashi)

**modules/targets/musashi/module.yml:**
```yaml
name: musashi
category: targets
description: Musashi.js - CORS, CSP, and JWT security demonstrations

compose: ./compose.yml

proxy:
  - hostname: cors
    service: musashi
    port: 3021
  - hostname: api-cors
    service: musashi
    port: 3020
  - hostname: csp
    service: musashi
    port: 3041
  - hostname: jwt
    service: musashi
    port: 3050

env:
  CORS_CLIENT_HOST: cors.samurai.wtf
  CORS_API_HOST: api-cors.samurai.wtf
  CSP_HOST: csp.samurai.wtf
  JWT_HOST: jwt.samurai.wtf
```

---

## Tool Modules

Tools are security applications installed via shell scripts. They're primarily for local (VM) deployments.

### Directory Structure

```
modules/tools/<name>/
├── module.yml
├── install.sh
├── remove.sh
├── start.sh      # Optional
└── stop.sh       # Optional
```

### module.yml Format

```yaml
name: example-tool
category: tools
description: Description of the tool

install: ./install.sh
remove: ./remove.sh
start: ./start.sh        # Optional
stop: ./stop.sh          # Optional
install_requires_root: true   # Set if install needs sudo
```

### Script Requirements

Scripts must:
- Be executable (`chmod +x`)
- Exit 0 on success, non-zero on failure
- Use `set -e` for fail-fast behavior

**Example install.sh:**
```bash
#!/bin/bash
set -e

VERSION="2.14.0"
URL="https://github.com/zaproxy/zaproxy/releases/download/v${VERSION}/ZAP_${VERSION}_Linux.tar.gz"
CHECKSUM="abc123..."  # SHA256

cd /tmp
wget -q "$URL" -O zap.tar.gz
echo "${CHECKSUM}  zap.tar.gz" | sha256sum -c
tar xzf zap.tar.gz -C /opt/
ln -sf /opt/ZAP_${VERSION}/zap.sh /usr/local/bin/zap
rm zap.tar.gz

echo "ZAP ${VERSION} installed successfully"
```

**Example remove.sh:**
```bash
#!/bin/bash
set -e

rm -rf /opt/ZAP_*
rm -f /usr/local/bin/zap

echo "ZAP removed successfully"
```

---

## Testing Modules

### 1. Validate Module Structure

```bash
# Check that module loads without errors
katana list targets
```

### 2. Test Installation

```bash
# Install the target
katana install <name>

# Check status
katana status
docker ps | grep katana-<name>
```

### 3. Test Proxy Access

```bash
# Ensure DNS is synced
sudo katana dns sync

# Start proxy
katana proxy start

# Test in browser or with curl
curl -k https://<hostname>.samurai.wtf
```

### 4. Test Removal

```bash
# Remove the target
katana remove <name>

# Verify containers removed
docker ps -a | grep katana-<name>
```

---

## Contributing Modules

To contribute a new module:

1. **Create the module** in `modules/targets/<name>/` or `modules/tools/<name>/`

2. **Test thoroughly** using the steps above

3. **Open a Pull Request** with:
   - The module files
   - Brief description of the target/tool
   - Any special setup requirements

### Guidelines

- Use official Docker images when possible
- Include meaningful descriptions
- Test on a clean system
- Document any special requirements in the PR

See [CONTRIBUTING.md](../CONTRIBUTING.md) for general contribution guidelines.

---

## Troubleshooting Module Issues

### Container Won't Start

Check container logs:
```bash
katana logs <name>
docker compose -p katana-<name> logs
```

### Proxy Returns 502/503

1. Verify container is running: `docker ps | grep <name>`
2. Check the service name matches `module.yml`
3. Check the port number is correct

### Module Not Listed

1. Verify `module.yml` syntax is valid YAML
2. Check all required fields are present
3. Ensure file is in correct directory (`modules/targets/<name>/`)

### Network Issues

Verify container is on katana-net:
```bash
docker inspect katana-<name>-<service>-1 | grep -A 10 Networks
```
