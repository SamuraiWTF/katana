# Deployment Guide

Katana supports two deployment modes: **local** (desktop/VM) and **remote** (cloud server). This guide covers both scenarios.

## Local Deployment

Use local deployment when running Katana on a desktop machine or VM for individual training.

### Overview

- DNS resolution via `/etc/hosts`
- Access targets at `https://<target>.samurai.wtf` (e.g., `https://dvwa.samurai.wtf`)
- Dashboard at `https://katana.samurai.wtf`
- Single user, local access only

### Setup Steps

1. **Install Katana** (see [Getting Started](getting-started.md))

2. **Initialize certificates:**
   ```bash
   katana cert init
   ```

3. **Enable privileged ports:**
   ```bash
   sudo katana setup-proxy
   ```

4. **Sync DNS for all targets:**
   ```bash
   sudo katana dns sync --all
   ```

5. **Import CA certificate** into your browser (see [Getting Started](getting-started.md#5-import-ca-certificate-in-browser))

6. **Install targets and start proxy:**
   ```bash
   katana install dvwa
   katana proxy start
   ```

### Running as a Service (Optional)

For convenience, you can run the proxy as a systemd service:

```ini
# /etc/systemd/system/katana.service
[Unit]
Description=Katana Proxy Server
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=YOUR_USERNAME
ExecStart=/usr/local/bin/katana proxy start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable katana
sudo systemctl start katana
```

---

## Remote Deployment

Use remote deployment for classroom labs where students access targets from their own machines.

### Overview

- DNS resolution via wildcard DNS record
- Access targets at `https://<target>.<base-domain>` (e.g., `https://dvwa.lab01.training.example.com`)
- Dashboard at `https://katana.<base-domain>`
- Multiple users can access from any network location

### Prerequisites

- A Linux server (EC2, DigitalOcean, etc.)
- A domain name you control
- Ability to create DNS records

### Infrastructure Setup

#### 1. Provision a Server

**AWS EC2 example:**
- AMI: Ubuntu 22.04 LTS
- Instance type: t3.medium or larger (depends on number of targets)
- Storage: 30GB+ (Docker images need space)

**Security Group rules:**
| Type | Port | Source |
|------|------|--------|
| SSH | 22 | Your IP |
| HTTP | 80 | 0.0.0.0/0 |
| HTTPS | 443 | 0.0.0.0/0 |

#### 2. Configure Wildcard DNS

Create a wildcard DNS record pointing to your server's public IP.

**AWS Route53 example:**

| Name | Type | Value |
|------|------|-------|
| `*.lab01.training.example.com` | A | `203.0.113.42` |

This single record handles all subdomains:
- `katana.lab01.training.example.com`
- `dvwa.lab01.training.example.com`
- `juiceshop.lab01.training.example.com`
- etc.

#### 3. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### Katana Setup

#### 1. Install Katana

```bash
curl -L https://github.com/SamuraiWTF/katana2/releases/latest/download/katana-linux-x64 -o katana
chmod +x katana
sudo mv katana /usr/local/bin/
```

#### 2. Configure for Remote Mode

Edit the configuration file:

```bash
mkdir -p ~/.config/katana
nano ~/.config/katana/config.yml
```

Set remote configuration:

```yaml
install_type: remote
base_domain: lab01.training.example.com
dashboard_hostname: katana

paths:
  modules: /opt/katana/modules
  data: /var/lib/katana
  certs: /var/lib/katana/certs
  state: /var/lib/katana/state.yml

proxy:
  http_port: 80
  https_port: 443
  # bind_address: "0.0.0.0"  # Optional: Override bind address
                              # Defaults: local → 127.0.0.1, remote → 0.0.0.0

docker_network: katana-net
```

Create the data directories:

```bash
sudo mkdir -p /opt/katana /var/lib/katana
sudo chown $USER:$USER /opt/katana /var/lib/katana
```

#### 3. Initialize Certificates

Generate certificates for your domain:

```bash
katana cert init
```

The wildcard certificate will cover `*.lab01.training.example.com`.

#### 4. Enable Privileged Ports

```bash
sudo katana setup-proxy
```

#### 5. Install Targets

```bash
katana install dvwa
katana install juiceshop
# ... install other targets as needed
```

#### 6. Create systemd Service

```bash
sudo nano /etc/systemd/system/katana.service
```

```ini
[Unit]
Description=Katana Proxy Server
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=YOUR_USERNAME
Environment="HOME=/home/YOUR_USERNAME"
ExecStart=/usr/local/bin/katana proxy start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable katana
sudo systemctl start katana
sudo systemctl status katana
```

### Student Access

Students can now access:

- **Dashboard:** `https://katana.lab01.training.example.com`
- **DVWA:** `https://dvwa.lab01.training.example.com`
- **Juice Shop:** `https://juiceshop.lab01.training.example.com`

**Important:** Students must import the CA certificate into their browsers. Provide them with:

1. Download link: `https://katana.lab01.training.example.com/api/certs/ca` (from the dashboard)
2. Instructions for importing into their browser

### Classroom Setup Tips

**Lock the system** after setting up targets:

```bash
katana lock
```

This prevents accidental modifications during class.

**Monitor status:**

```bash
katana status
katana doctor
sudo systemctl status katana
```

**View logs:**

```bash
# Katana proxy logs
sudo journalctl -u katana -f

# Target container logs
katana logs dvwa -f
```

---

## Security Considerations

### Training Environments Only

Katana is designed for **isolated training environments**. The targets it deploys are intentionally vulnerable applications.

**Do not:**
- Deploy on production networks
- Expose to the public internet without understanding the risks
- Use real credentials or sensitive data in training labs

### Network Isolation

For remote deployments, consider:

- Using a dedicated VPC/subnet for training labs
- Restricting access to known student IP ranges
- Using VPN for access instead of public exposure

### Certificate Trust

The self-signed CA is only trusted by browsers that import it. This is intentional - it prevents the certificates from being trusted system-wide or by other applications.

---

## Troubleshooting Deployment

### DNS Not Resolving (Remote)

Verify your wildcard DNS:

```bash
dig +short anything.lab01.training.example.com
# Should return your server IP
```

### Port Already in Use

Check what's using ports 80/443:

```bash
sudo lsof -i :443
sudo lsof -i :80
```

### Proxy Won't Start

Check the service status and logs:

```bash
sudo systemctl status katana
sudo journalctl -u katana -n 50
```

### Docker Permission Denied

Ensure user is in docker group:

```bash
groups  # Should include 'docker'
# If not:
sudo usermod -aG docker $USER
newgrp docker
```

See [Troubleshooting](troubleshooting.md) for more common issues.
