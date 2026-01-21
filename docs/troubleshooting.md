# Troubleshooting

Solutions for common issues when using Katana.

## Using `katana doctor`

The first step for any issue should be running the health check:

```bash
katana doctor
```

This checks 9 system requirements and provides fix suggestions for any failures.

Example output with issues:

```
Katana Health Check
===================

✓ Docker daemon running
✗ User has Docker permissions
  → Fix: sudo usermod -aG docker $USER && newgrp docker
✓ Docker network 'katana-net' exists
✓ OpenSSL available
✓ Certificates initialized
✓ Certificates valid (expires in 364 days)
✗ Port 443 bindable
  → Fix: sudo katana setup-proxy
✓ DNS entries in sync (8/8)
✓ State file valid

Health: 7/9 checks passed
```

---

## Common Errors

### Docker Permission Denied

**Error:**
```
Permission denied accessing Docker socket
```

**Cause:** Your user is not in the `docker` group.

**Fix:**
```bash
sudo usermod -aG docker $USER
newgrp docker
```

Then log out and back in, or run `newgrp docker` to apply the change immediately.

---

### Port 443 Bind Failed

**Error:**
```
Permission denied binding to port 443
```

**Cause:** The Katana binary doesn't have the capability to bind to privileged ports.

**Fix:**
```bash
sudo katana setup-proxy
```

**Note:** This must be re-run after updating/replacing the binary.

---

### Docker Daemon Not Running

**Error:**
```
Docker daemon is not running
```

**Fix:**
```bash
sudo systemctl start docker
sudo systemctl enable docker  # Auto-start on boot
```

---

### Certificate Errors

#### Certificates Not Initialized

**Error:**
```
CA not initialized
```

**Fix:**
```bash
katana cert init
```

#### Certificate Expired

**Error:**
```
Certificates expired
```

**Fix:**
```bash
katana cert renew
```

#### Browser Shows Certificate Warning

**Cause:** The CA certificate is not imported into your browser.

**Fix:**
1. Export the CA: `katana cert export`
2. Import `ca.crt` into your browser (see [Getting Started](getting-started.md#5-import-ca-certificate-in-browser))

---

### DNS Not Resolving

#### `/etc/hosts` Not Updated

**Symptom:** Browser can't reach `https://dvwa.samurai.wtf`

**Check:**
```bash
katana dns list
```

**Fix:**
```bash
sudo katana dns sync --all
```

#### Hostname Not in `/etc/hosts`

**Symptom:** Target installed but hostname doesn't resolve.

**Check:**
```bash
cat /etc/hosts | grep katana-managed
```

**Fix:**
```bash
sudo katana dns sync
```

---

### Target Not Accessible

#### Container Not Running

**Check:**
```bash
katana status
docker ps | grep katana
```

**Fix:**
```bash
katana start <target>
```

#### Proxy Not Running

**Symptom:** All targets inaccessible, connection refused.

**Fix:**
```bash
katana proxy start
```

#### Wrong Hostname

**Check:** Ensure you're using the correct URL format:
- Local: `https://dvwa.samurai.wtf`
- Remote: `https://dvwa.lab01.training.example.com`

---

### System Locked Error

**Error:**
```
System is locked - cannot modify targets
```

**Cause:** The system was locked (typically by an instructor).

**Fix:**
```bash
katana unlock
```

---

### Container Startup Failed

**Symptom:** Target install succeeds but container isn't running.

**Check:**
```bash
katana logs <target>
docker compose -p katana-<target> logs
```

Common causes:
- Port conflict with another container
- Missing Docker image (network issue during pull)
- Insufficient memory

---

## Performance Issues

### Slow Target Startup

**Cause:** Docker images being pulled for the first time.

**Solution:** Pre-pull images:
```bash
katana install <target>  # First install pulls images
# Subsequent starts will be faster
```

### High Memory Usage

**Cause:** Too many targets running simultaneously.

**Solution:** Stop unused targets:
```bash
katana stop <target>
```

Check memory usage:
```bash
docker stats
```

---

## Recovery Procedures

### Reset State File

If the state file becomes corrupted:

```bash
# Backup current state
cp ~/.local/share/katana/state.yml ~/.local/share/katana/state.yml.bak

# Remove state file (Katana will create a new one)
rm ~/.local/share/katana/state.yml

# Re-sync with Docker
katana cleanup
```

### Remove Orphaned Containers

Containers from deleted or corrupted state:

```bash
# See what would be cleaned up
katana cleanup --dry-run

# Clean up
katana cleanup
```

### Regenerate Certificates

If certificates are corrupted or lost:

```bash
# Remove old certs
rm -rf ~/.local/share/katana/certs

# Regenerate
katana cert init
```

**Note:** After regenerating the CA, you must re-import it into all browsers.

### Complete Reset

To completely reset Katana:

```bash
# Stop all targets
katana list --installed | grep -v "Available" | awk '{print $1}' | xargs -I {} katana remove {}

# Remove all Katana data
rm -rf ~/.local/share/katana
rm -rf ~/.config/katana

# Remove Docker network
docker network rm katana-net

# Re-run setup
katana cert init
sudo katana setup-proxy
sudo katana dns sync --all
```

---

## Getting Help

If you can't resolve an issue:

1. **Run diagnostics:**
   ```bash
   katana doctor --json > doctor-output.json
   katana status > status-output.txt
   ```

2. **Collect logs:**
   ```bash
   katana logs <target> > target-logs.txt
   ```

3. **Open an issue:** [GitHub Issues](https://github.com/SamuraiWTF/katana/issues)

Include:
- Output from `katana doctor`
- Output from `katana status`
- Relevant logs
- Steps to reproduce the issue
- Your Linux distribution and version
