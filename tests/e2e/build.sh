#!/bin/bash
# Katana 2 E2E Tests - Build Verification
# Category A1: Verifies that the project builds correctly

set -e
cd "$(dirname "$0")/../.."

echo "=========================================="
echo "A1: Build Verification Tests"
echo "=========================================="

echo ""
echo "A1.1: TypeScript compilation..."
bunx tsc --noEmit
echo "  PASS"

echo ""
echo "A1.2: Biome linting..."
bunx biome check src/
echo "  PASS"

echo ""
echo "A1.3: CLI build..."
bun build --compile src/cli.ts --outfile bin/katana
if [ -f bin/katana ]; then
    echo "  PASS ($(ls -lh bin/katana | awk '{print $5}'))"
else
    echo "  FAIL: bin/katana not created"
    exit 1
fi

echo ""
echo "A1.4: UI build..."
bun run build:ui
if [ -d src/ui/dist ] && [ -f src/ui/dist/index.html ]; then
    echo "  PASS ($(ls src/ui/dist/*.js 2>/dev/null | wc -l) JS files)"
else
    echo "  FAIL: src/ui/dist/ not populated correctly"
    exit 1
fi

echo ""
echo "A1.5: CLI version..."
VERSION=$(./bin/katana --version 2>&1)
if echo "$VERSION" | grep -qE "^[0-9]+\.[0-9]+\.[0-9]+"; then
    echo "  PASS ($VERSION)"
else
    echo "  FAIL: unexpected version output: $VERSION"
    exit 1
fi

echo ""
echo "=========================================="
echo "A1: All build tests PASSED"
echo "=========================================="
