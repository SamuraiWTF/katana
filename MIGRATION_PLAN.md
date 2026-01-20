# Katana v2 Migration Plan

This document outlines the plan to migrate the Katana repository from v1 (Python-based) to v2 (Bun/TypeScript-based).

## Overview

- **Current state**: Python-based Katana v1 with CherryPy web UI
- **Target state**: TypeScript/Bun-based Katana v2 with React dashboard and single-binary distribution
- **Working branch**: `katana-2-mvp` (merge to main after validation)

---

## Phase 1: Preserve Legacy

### 1.1 Tag Current Version
```bash
git tag -a v1.0.0 -m "Katana v1.0.0 - Legacy Python version"
git push origin v1.0.0
```

### 1.2 Create Legacy Branch
```bash
git checkout -b v1-legacy
git push origin v1-legacy
git checkout main
```

---

## Phase 2: Create MVP Branch

### 2.1 Create Working Branch
```bash
git checkout -b katana-2-mvp
```

### 2.2 Remove Legacy Code
Remove all v1 files and directories:
- `katanacli.py`
- `katanacore.py`
- `katanaserve.py`
- `katanaerrors.py`
- `katanarepo.py`
- `provisioners/`
- `plugins/`
- `modules/` (will be replaced with v2 modules)
- `html/`
- `icons/`
- `test/`
- `Pipfile`, `Pipfile.lock`
- `requirements.txt`
- `.github/workflows/` (will be replaced)

### 2.3 Copy Katana2 Code
Copy from `../katana2/` excluding:
- `TOOLS_MIGRATION.md`
- `CHANGELOG.md`
- `.CLAUDE_LAST_SESSION.md`
- `bin/` (compiled binaries)
- `.git/` (git history)

Files/directories to copy:
- `src/`
- `modules/`
- `tests/`
- `docs/`
- `package.json`
- `tsconfig.json`
- `biome.json`
- `bun.lock`
- `README.md`
- `CONTRIBUTING.md` (with URL updates)

---

## Phase 3: Project Configuration

### 3.1 Add LICENSE File
Create `LICENSE` with LGPL-3.0 text (matching parent SamuraiWTF project).

### 3.2 Update CONTRIBUTING.md
Copy from katana2 and update:
- All `katana2` references → `katana`
- License reference: Apache 2.0 → LGPL-3.0

### 3.3 Update package.json
Ensure `"name": "katana"` (not `katana2`).

---

## Phase 4: GitHub Workflows

### 4.1 CI Workflow (`.github/workflows/ci.yml`)
Triggers: push/PR to main and katana-2-mvp branches

Jobs:
1. **Lint**: Run `bunx biome check src/`
2. **Type Check**: Run `bunx tsc --noEmit`
3. **Build**: Run `bun run build` to verify compilation

### 4.2 Release Workflow (`.github/workflows/release.yml`)
Triggers: tag push matching `v*`

Jobs:
1. Build Linux binary (`bun build --compile --target=bun-linux-x64`)
2. Create GitHub Release
3. Upload binary as release asset

Future: Add macOS and Windows targets post-MVP.

---

## Phase 5: Final Verification

### 5.1 Verify README
- Reflects v2 functionality
- Correct installation instructions
- Accurate feature list

### 5.2 Verify Documentation
- `/docs/` folder present with:
  - `architecture.md`
  - `cli-reference.md`
  - `deployment-guide.md`
  - `development-guide.md`
  - `module-development.md`
  - `troubleshooting.md`

### 5.3 Test Build Locally
```bash
bun install
bun run lint
bunx tsc --noEmit
bun run build
```

---

## Post-Migration Notes

- **Breaking change**: v2 is a complete rewrite with no backward compatibility
- **Binary distribution**: Single executable with embedded UI assets
- **Module format**: Docker Compose-based targets (different from v1 YAML+provisioner model)
- **Release process**: Push a tag (e.g., `v2.0.0`) to trigger automated release build

---

## File Structure After Migration

```
katana/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── docs/
│   ├── architecture.md
│   ├── cli-reference.md
│   ├── deployment-guide.md
│   ├── development-guide.md
│   ├── module-development.md
│   └── troubleshooting.md
├── modules/
│   ├── targets/
│   └── tools/
├── src/
│   ├── cli.ts
│   ├── server.ts
│   ├── commands/
│   ├── core/
│   ├── server/
│   ├── ui/
│   ├── types/
│   ├── platform/
│   └── utils/
├── tests/
│   └── e2e/
├── .gitignore
├── biome.json
├── bun.lock
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```
