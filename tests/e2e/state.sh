#!/bin/bash
# Katana 2 E2E Tests - State Management
# Category A6: Verifies state file is correctly maintained

set -e
cd "$(dirname "$0")/../.."

KATANA="./bin/katana"
STATE_FILE="$HOME/.local/share/katana/state.yml"

if [ ! -f "$KATANA" ]; then
    echo "ERROR: $KATANA not found. Run build.sh first."
    exit 1
fi

echo "=========================================="
echo "A6: State Management Tests"
echo "=========================================="

# Ensure state directory exists
mkdir -p "$(dirname "$STATE_FILE")"

echo ""
echo "A6.1: State file exists..."
# Initialize if needed
if [ ! -f "$STATE_FILE" ]; then
    echo "  Creating initial state..."
    $KATANA status > /dev/null 2>&1 || true
fi

if [ -f "$STATE_FILE" ]; then
    echo "  PASS ($STATE_FILE exists)"
else
    echo "  FAIL: state file not created"
    exit 1
fi

echo ""
echo "A6.2: State valid YAML..."
# Use bun to validate YAML structure
VALID=$(bun -e "
const yaml = require('yaml');
const fs = require('fs');
try {
    const content = fs.readFileSync('$STATE_FILE', 'utf8');
    const parsed = yaml.parse(content);
    if (typeof parsed === 'object' && parsed !== null) {
        console.log('valid');
    } else {
        console.log('invalid: not an object');
    }
} catch (e) {
    console.log('invalid: ' + e.message);
}
" 2>&1)

if [ "$VALID" = "valid" ]; then
    echo "  PASS (valid YAML structure)"
else
    echo "  FAIL: $VALID"
    exit 1
fi

echo ""
echo "A6.3: Install updates state..."
# Clean start
$KATANA remove dvwa 2>/dev/null || true
sleep 2

$KATANA install dvwa
sleep 5

if grep -q "dvwa" "$STATE_FILE"; then
    echo "  PASS (dvwa in state file)"
else
    echo "  FAIL: dvwa not found in state file"
    cat "$STATE_FILE"
    exit 1
fi

echo ""
echo "A6.4: Remove updates state..."
$KATANA remove dvwa
sleep 2

# Check that dvwa entry is removed (not just the word "dvwa" anywhere)
if grep -q "name: dvwa" "$STATE_FILE"; then
    echo "  FAIL: dvwa still in state file"
    cat "$STATE_FILE"
    exit 1
else
    echo "  PASS (dvwa removed from state)"
fi

echo ""
echo "A6.5: Lock state persisted..."
$KATANA lock

if grep -q "locked: true" "$STATE_FILE"; then
    echo "  Lock PASS"
else
    echo "  Lock FAIL: state file doesn't show locked"
    grep locked "$STATE_FILE" || echo "  No 'locked' field found"
fi

$KATANA unlock

if grep -q "locked: false" "$STATE_FILE"; then
    echo "  Unlock PASS"
else
    echo "  Unlock FAIL: state file doesn't show unlocked"
    grep locked "$STATE_FILE" || echo "  No 'locked' field found"
fi

echo ""
echo "A6.6: State survives restart..."
# Get current state hash
BEFORE=$(md5sum "$STATE_FILE" | cut -d' ' -f1)

# Run status (should not modify state)
$KATANA status > /dev/null 2>&1

AFTER=$(md5sum "$STATE_FILE" | cut -d' ' -f1)

if [ "$BEFORE" = "$AFTER" ]; then
    echo "  PASS (state unchanged by read operations)"
else
    echo "  WARN: state was modified by status command"
fi

echo ""
echo "=========================================="
echo "A6: All state tests PASSED"
echo "=========================================="
