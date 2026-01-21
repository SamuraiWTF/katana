# Security Policy

## Intended Use

Katana is designed for **isolated training environments only**. It deploys intentionally vulnerable web applications for educational purposes.

**Do not use Katana:**
- On production systems
- On networks containing sensitive data
- On publicly accessible servers without understanding the risks

## Reporting Vulnerabilities

### For Katana Itself

If you discover a security vulnerability in Katana (the management tool, not the vulnerable targets it deploys), please [open an issue](https://github.com/SamuraiWTF/katana2/issues/new) with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

Since Katana is designed for isolated training environments (not production or sensitive networks), public disclosure via GitHub issues is acceptable.

### For Vulnerable Targets

The targets deployed by Katana (DVWA, Juice Shop, etc.) are **intentionally vulnerable**. These are not security issues to report - they are the intended functionality.

If you find a vulnerability in a target application that is:
- Unintentional (breaks the target entirely)
- A real security issue in the target's infrastructure

Please report it to that project directly, not to Katana.

## Security Considerations for Users

### Network Isolation

When deploying Katana, especially remotely:

- Use a dedicated network/VPC for training labs
- Restrict access to known IP ranges (e.g. AWS Security Group rules)
- Consider VPN access instead of public exposure
- Monitor for unauthorized access

### Certificate Trust

Katana uses self-signed certificates. The CA must be explicitly imported into browsers. This is intentional - it prevents:

- System-wide certificate trust
- Accidental trust by other applications
- Potential for misuse outside the training context

### Docker Security

Katana runs Docker containers with default isolation. For additional security:

- Keep Docker updated
- Use Docker's user namespace remapping
- Monitor container resource usage
- Regularly prune unused images and containers

### Credentials

Default credentials for vulnerable targets are intentional. For classroom use:

- Brief students on the training nature
- Reset targets between sessions if needed
- Don't use real personal data in training