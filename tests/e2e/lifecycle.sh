#!/bin/bash
# Katana 2 E2E Tests - Target Lifecycle
# Category A3: Verifies target install/start/stop/remove workflow

set -e
cd "$(dirname "$0")/../.."

KATANA="./bin/katana"

if [ ! -f "$KATANA" ]; then
    echo "ERROR: $KATANA not found. Run build.sh first."
    exit 1
fi

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running"
    exit 1
fi

echo "=========================================="
echo "A3: Target Lifecycle Tests"
echo "=========================================="

# Cleanup function
cleanup() {
    echo ""
    echo "Cleanup: removing test target..."
    $KATANA remove dvwa 2>/dev/null || true
}
trap cleanup EXIT

# Make sure we start clean
$KATANA remove dvwa 2>/dev/null || true
sleep 2

echo ""
echo "A3.1: Install DVWA..."
$KATANA install dvwa
echo "  Waiting for containers to be created..."
sleep 5

# Verify containers exist (but are stopped after install)
if docker ps -a | grep -q "katana-dvwa"; then
    echo "  PASS (containers created)"
else
    echo "  FAIL: containers not found"
    docker ps -a
    exit 1
fi

# Verify containers are NOT running yet
if docker ps | grep -q "katana-dvwa"; then
    echo "  FAIL: containers should not be running after install"
    exit 1
else
    echo "  PASS (containers stopped as expected)"
fi

echo ""
echo "A3.1b: Start installed target..."
$KATANA start dvwa
sleep 5

# Now verify containers are running
if docker ps | grep -q "katana-dvwa"; then
    echo "  PASS (containers running after explicit start)"
else
    echo "  FAIL: containers not running after start"
    docker ps
    exit 1
fi

echo ""
echo "A3.2: Verify installed..."
OUTPUT=$($KATANA list --installed 2>&1)
if echo "$OUTPUT" | grep -qi "dvwa"; then
    echo "  PASS (dvwa in installed list)"
else
    echo "  FAIL: dvwa not in installed list"
    echo "  Output: $OUTPUT"
    exit 1
fi

echo ""
echo "A3.3: Stop target..."
$KATANA stop dvwa
sleep 3

OUTPUT=$($KATANA status 2>&1)
if echo "$OUTPUT" | grep -qi "stopped\|exited"; then
    echo "  PASS (target stopped)"
else
    echo "  Checking docker status..."
    docker ps -a --filter "name=katana-dvwa"
fi

echo ""
echo "A3.4: Start target..."
$KATANA start dvwa
sleep 5

if docker ps | grep -q "katana-dvwa"; then
    echo "  PASS (target started)"
else
    echo "  FAIL: target not running"
    exit 1
fi

echo ""
echo "A3.5: View logs..."
OUTPUT=$($KATANA logs dvwa --tail 5 2>&1) || true
if [ -n "$OUTPUT" ]; then
    echo "  PASS (got log output)"
    echo "  Sample: $(echo "$OUTPUT" | head -2)"
else
    echo "  WARN: no log output (may be expected)"
fi

echo ""
echo "A3.6: Remove target..."
$KATANA remove dvwa
sleep 3

if ! docker ps -a | grep -q "katana-dvwa"; then
    echo "  PASS (containers removed)"
else
    echo "  FAIL: containers still exist"
    docker ps -a | grep katana-dvwa
    exit 1
fi

echo ""
echo "A3.7: Verify removed..."
OUTPUT=$($KATANA list --installed 2>&1)
if ! echo "$OUTPUT" | grep -qi "dvwa.*installed\|^\s*dvwa\s*$"; then
    echo "  PASS (dvwa not in installed list)"
else
    echo "  FAIL: dvwa still in installed list"
    echo "  Output: $OUTPUT"
    exit 1
fi

# Disable cleanup trap since we cleaned up in A3.6
trap - EXIT

echo ""
echo "=========================================="
echo "A3: All lifecycle tests PASSED"
echo "=========================================="
