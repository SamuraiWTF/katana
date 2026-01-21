# Changelog

All notable changes to Katana will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-01-06

### Added

- **Complete rewrite** of Katana using Bun/TypeScript
- **Single executable** distribution - no runtime dependencies
- **Built-in reverse proxy** with hostname-based routing
- **Web dashboard** for managing targets
- **Self-signed CA** with browser-exportable certificate
- **Docker Compose** based target deployment
- **Health check system** (`katana doctor`)

### Target Modules

- DVWA (Damn Vulnerable Web Application)
- OWASP Juice Shop
- SamuraiWTF Dojo Basic Lite
- SamuraiWTF Dojo Scavenger Lite
- DVGA (Damn Vulnerable GraphQL Application)
- OWASP WrongSecrets
- Musashi.js (CORS, CSP, JWT demos)

### CLI Commands

- `install`, `remove`, `start`, `stop` - Target lifecycle
- `status`, `list`, `logs` - Information commands
- `lock`, `unlock` - System locking
- `cert init`, `cert renew`, `cert export`, `cert status` - Certificate management
- `dns sync`, `dns list` - DNS management
- `proxy start`, `proxy status` - Proxy management
- `doctor` - Health checks
- `cleanup` - Resource cleanup
- `setup-proxy` - Initial setup

### Changed

- Replaced Python implementation with Bun/TypeScript
- Replaced custom plugin system with Docker Compose
- Moved from port 8443 to standard HTTPS port 443
- No longer requires running as root (uses setcap)

### Removed

- Python-based architecture
- Ansible-like module configuration
- CherryPy web server

[2.0.0]: https://github.com/SamuraiWTF/katana2/releases/tag/v2.0.0
