# Katana

**Lab management for web application security training**

Katana is the lab management solution for [OWASP SamuraiWTF](https://github.com/SamuraiWTF/samuraiwtf). It enables instructors and students to deploy and manage vulnerable web applications for security training environments.

## Features

- **Single Executable** - Distributed as a single binary, no runtime dependencies
- **Built-in Reverse Proxy** - Hostname-based routing to targets (e.g., `https://dvwa.samurai.wtf`)
- **Docker-based Targets** - Uses Docker Compose for reliable, isolated deployments
- **Self-signed CA** - HTTPS everywhere with exportable CA certificate for browser trust
- **Web Dashboard** - Modern UI for managing targets at `https://katana.samurai.wtf`
- **Minimal Privileges** - Runs as regular user (only DNS sync requires sudo)

## Use Cases

**Local Installation** - Run on a desktop or VM for individual training. Katana manages `/etc/hosts` for local DNS resolution.

**Remote Installation** - Deploy on a cloud instance (EC2, etc.) for classroom labs. Uses wildcard DNS for access from any machine.

## Quick Start

```bash
# 1. Download the latest release
curl -L https://github.com/SamuraiWTF/katana2/releases/latest/download/katana-linux-x64 -o katana
chmod +x katana

# 2. Initialize certificates
./katana cert init

# 3. Enable privileged port binding
sudo ./katana setup-proxy

# 4. Sync DNS entries for all targets
sudo ./katana dns sync --all

# 5. Install a target and start the proxy
./katana install dvwa
./katana proxy start
```

Then visit `https://katana.samurai.wtf` in your browser. You'll need to import the CA certificate (run `katana cert export` and import `ca.crt` into your browser).

## Available Targets

| Target | Description |
|--------|-------------|
| **dvwa** | Damn Vulnerable Web Application - Classic OWASP Top 10 training |
| **juiceshop** | OWASP Juice Shop - Modern vulnerable web application |
| **dojo-basic-lite** | SamuraiWTF Dojo - SQLi, XSS, and more |
| **dojo-scavenger-lite** | SamuraiWTF Scavenger Hunt challenges |
| **dvga** | Damn Vulnerable GraphQL Application |
| **wrongsecrets** | OWASP WrongSecrets - Secrets management challenges |
| **musashi** | CORS, CSP, and JWT security demonstrations |

## Requirements

- **Linux** (Debian/Ubuntu tested; other distributions may work)
- **Docker Engine 20.10+** with Docker Compose V2
- **OpenSSL** (usually pre-installed)

See the [Getting Started Guide](docs/getting-started.md) for detailed installation instructions.

## Documentation

- [Getting Started](docs/getting-started.md) - Installation and initial setup
- [CLI Reference](docs/cli-reference.md) - Complete command documentation
- [Deployment Guide](docs/deployment-guide.md) - Local vs cloud deployment
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions

### For Developers

- [Module Development](docs/module-development.md) - Creating new targets and tools
- [Architecture](docs/architecture.md) - System design overview
- [Development Guide](docs/development-guide.md) - Contributing code

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- **Bug Reports** - [Open an issue](https://github.com/SamuraiWTF/katana2/issues/new?template=bug_report.md)
- **Feature Requests** - [Open an issue](https://github.com/SamuraiWTF/katana2/issues/new?template=feature_request.md)
- **New Targets** - See the [Module Development Guide](docs/module-development.md)

## Security

Katana is designed for **training environments only**. Do not use it on production systems or networks you don't control.

For security concerns, please see [SECURITY.md](SECURITY.md).

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.

## Acknowledgments

Katana is part of the [OWASP SamuraiWTF](https://github.com/SamuraiWTF/samuraiwtf) project.
