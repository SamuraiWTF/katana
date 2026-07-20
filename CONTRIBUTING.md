# Contributing to Katana

Thank you for your interest in contributing to Katana! This document provides guidelines for contributing to the project.

## Code of Conduct

This project follows the [OWASP Code of Conduct](https://owasp.org/www-policy/operational/code-of-conduct). Please be respectful and constructive in all interactions.

## Ways to Contribute

### Bug Reports

Found a bug? Please [open an issue](https://github.com/SamuraiWTF/katana/issues/new?template=bug_report.md) with:

- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Output from `katana doctor`
- Your Linux distribution and version

### Feature Requests

Have an idea? [Open an issue](https://github.com/SamuraiWTF/katana/issues/new?template=feature_request.md) describing:

- The problem you're trying to solve
- Your proposed solution
- Alternative approaches you considered

### New Target Modules

Want to add a vulnerable application? See the [Module Development Guide](docs/module-development.md) for:

- Module structure requirements
- Testing your module
- Submitting a pull request

### Documentation Improvements

Documentation PRs are always welcome! This includes:

- Fixing typos and errors
- Clarifying instructions
- Adding examples
- Translating documentation

### Code Contributions

For code changes, please:

1. Open an issue first to discuss the change
2. Fork the repository
3. Create a feature branch
4. Make your changes
5. Submit a pull request

## Development Setup

See the [Development Guide](docs/development-guide.md) for detailed setup instructions.

Quick start:

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/katana.git
cd katana

# Install dependencies
bun install

# Run from source
bun run src/cli.ts --help
```

## Pull Request Process

### Before Submitting

1. **Create an issue** (unless fixing a typo or obvious bug)
2. **Fork and branch** from `main`
3. **Make changes** following our code style
4. **Test your changes:**
   ```bash
   bunx tsc --noEmit          # Type checking
   bunx biome check src/       # Linting
   ./tests/e2e/run-all.sh     # E2E tests
   ```
5. **Update documentation** if needed

### PR Requirements

- Clear description of changes
- Link to related issue(s)
- Passes all CI checks
- Includes tests for new functionality
- Documentation updated if applicable

### Review Process

1. Maintainers will review your PR
2. Address any feedback
3. Once approved, a maintainer will merge

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check code
bunx biome check src/

# Auto-fix issues
bunx biome check --apply src/

# Format code
bunx biome format --write src/
```

### TypeScript Guidelines

- Use strict TypeScript
- Prefer explicit types for public APIs
- Use Zod for runtime validation
- Add JSDoc comments for public functions

### Commit Messages

Write clear, descriptive commit messages:

```
Add certificate expiration warning to status command

- Check cert expiration when showing status
- Display warning if expiring within 30 days
- Include renewal instructions in warning
```

## Questions?

- Check existing [issues](https://github.com/SamuraiWTF/katana/issues)
- Read the [documentation](docs/)
- Open a new issue for questions

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
