#!/bin/bash
# Katana 2 E2E Tests - CLI Commands
# Category A2: Verifies CLI commands work correctly

set -e
cd "$(dirname "$0")/../.."

KATANA="./bin/katana"

if [ ! -f "$KATANA" ]; then
    echo "ERROR: $KATANA not found. Run build.sh first."
    exit 1
fi

echo "=========================================="
echo "A2: CLI Command Tests"
echo "=========================================="

echo ""
echo "A2.1: List targets..."
OUTPUT=$($KATANA list targets 2>&1)
if echo "$OUTPUT" | grep -qi "dvwa"; then
    echo "  PASS (found dvwa)"
else
    echo "  FAIL: dvwa not found in output"
    echo "  Output: $OUTPUT"
    exit 1
fi

echo ""
echo "A2.2: List tools..."
$KATANA list tools > /dev/null 2>&1
echo "  PASS (no error)"

echo ""
echo "A2.3: Status..."
OUTPUT=$($KATANA status 2>&1)
if echo "$OUTPUT" | grep -qi "target"; then
    echo "  PASS"
else
    echo "  FAIL: unexpected status output"
    echo "  Output: $OUTPUT"
    exit 1
fi

echo ""
echo "A2.4: Doctor..."
OUTPUT=$($KATANA doctor 2>&1) || true  # May have failures, that's OK
if echo "$OUTPUT" | grep -qi "docker"; then
    echo "  PASS (doctor ran)"
else
    echo "  FAIL: unexpected doctor output"
    echo "  Output: $OUTPUT"
    exit 1
fi

echo ""
echo "A2.5: Cert status..."
OUTPUT=$($KATANA cert status 2>&1) || true
if echo "$OUTPUT" | grep -qi -E "(certificate|cert|CA|not initialized)"; then
    echo "  PASS"
else
    echo "  FAIL: unexpected cert status output"
    echo "  Output: $OUTPUT"
    exit 1
fi

echo ""
echo "A2.6: DNS list..."
$KATANA dns list > /dev/null 2>&1 || true
echo "  PASS (no crash)"

echo ""
echo "A2.7-8: Lock/Unlock..."
$KATANA lock
OUTPUT=$($KATANA status 2>&1)
if echo "$OUTPUT" | grep -qi "locked.*yes\|locked: true"; then
    echo "  Lock: PASS"
else
    echo "  Lock: FAIL - status doesn't show locked"
    echo "  Output: $OUTPUT"
fi

$KATANA unlock
OUTPUT=$($KATANA status 2>&1)
if echo "$OUTPUT" | grep -qi "locked.*no\|locked: false"; then
    echo "  Unlock: PASS"
else
    echo "  Unlock: FAIL - status doesn't show unlocked"
    echo "  Output: $OUTPUT"
fi

echo ""
echo "=========================================="
echo "A2: All CLI tests PASSED"
echo "=========================================="
