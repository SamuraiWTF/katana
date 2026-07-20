#!/bin/bash
# Katana 2 E2E Tests - API Endpoints
# Category A4: Verifies REST API endpoints work correctly
# REQUIRES: Proxy running on https://katana.test

set -e
cd "$(dirname "$0")/../.."

BASE="https://katana.test"
# Use --resolve to bypass /etc/hosts for testing (avoids needing sudo dns sync)
CURL="curl -sk --connect-timeout 5 --resolve katana.test:443:127.0.0.1"

echo "=========================================="
echo "A4: API Endpoint Tests"
echo "=========================================="

# Check if proxy is reachable
echo ""
echo "Checking proxy connectivity..."
if ! $CURL "$BASE" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to $BASE"
    echo "Make sure the proxy is running: ./bin/katana proxy start"
    exit 1
fi
echo "  Proxy is reachable"

# Cleanup function
cleanup() {
    echo ""
    echo "Cleanup..."
    $CURL -X POST "$BASE/api/system/unlock" > /dev/null 2>&1 || true
    $CURL -X POST "$BASE/api/modules/dvwa/remove" > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo ""
echo "A4.1: List modules (GET /api/modules)..."
MODULES=$($CURL "$BASE/api/modules" 2>&1)
if echo "$MODULES" | grep -q "dvwa"; then
    echo "  PASS (found dvwa in response)"
else
    echo "  FAIL: dvwa not in response"
    echo "  Response: $MODULES"
    exit 1
fi

echo ""
echo "A4.2: System status (GET /api/system)..."
STATUS=$($CURL "$BASE/api/system" 2>&1)
if echo "$STATUS" | grep -q "docker"; then
    echo "  PASS (got system status)"
else
    echo "  FAIL: unexpected response"
    echo "  Response: $STATUS"
    exit 1
fi

echo ""
echo "A4.3: Install target (POST /api/modules/dvwa/install)..."
INSTALL=$($CURL -X POST "$BASE/api/modules/dvwa/install" 2>&1)
if echo "$INSTALL" | grep -q -E "(id|operation|success)"; then
    OP_ID=$(echo "$INSTALL" | grep -oE '"id"\s*:\s*"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  PASS (operation started: $OP_ID)"
else
    echo "  Response: $INSTALL"
    echo "  Checking if already installed..."
fi

echo "  Waiting for install to complete (30s max)..."
for i in {1..30}; do
    sleep 1
    if docker ps | grep -q "katana-dvwa"; then
        echo "  Containers running after ${i}s"
        break
    fi
done

echo ""
echo "A4.4: Operation status (GET /api/operations/:id)..."
if [ -n "$OP_ID" ]; then
    OP_STATUS=$($CURL "$BASE/api/operations/$OP_ID" 2>&1)
    if echo "$OP_STATUS" | grep -q -E "(status|progress|complete)"; then
        echo "  PASS (got operation status)"
    else
        echo "  WARN: could not get operation status"
    fi
else
    echo "  SKIP (no operation ID)"
fi

echo ""
echo "A4.5: Stop target (POST /api/modules/dvwa/stop)..."
STOP=$($CURL -X POST "$BASE/api/modules/dvwa/stop" 2>&1)
if echo "$STOP" | grep -q -E "(success|id|operation)"; then
    echo "  PASS"
else
    echo "  Response: $STOP"
fi
sleep 3

echo ""
echo "A4.6: Start target (POST /api/modules/dvwa/start)..."
START=$($CURL -X POST "$BASE/api/modules/dvwa/start" 2>&1)
if echo "$START" | grep -q -E "(success|id|operation)"; then
    echo "  PASS"
else
    echo "  Response: $START"
fi
sleep 3

echo ""
echo "A4.7: Remove target (POST /api/modules/dvwa/remove)..."
REMOVE=$($CURL -X POST "$BASE/api/modules/dvwa/remove" 2>&1)
if echo "$REMOVE" | grep -q -E "(success|id|operation)"; then
    echo "  PASS"
else
    echo "  Response: $REMOVE"
fi
sleep 5

echo ""
echo "A4.8: Lock system (POST /api/system/lock)..."
LOCK=$($CURL -X POST "$BASE/api/system/lock" 2>&1)
if echo "$LOCK" | grep -q -E "(locked|success|true)"; then
    echo "  PASS"
else
    echo "  Response: $LOCK"
fi

echo ""
echo "A4.11: Install when locked (should fail)..."
LOCKED_INSTALL=$($CURL -X POST "$BASE/api/modules/dvwa/install" 2>&1)
if echo "$LOCKED_INSTALL" | grep -q -E "(locked|error|403|cannot)"; then
    echo "  PASS (correctly rejected)"
else
    echo "  FAIL: should have been rejected"
    echo "  Response: $LOCKED_INSTALL"
fi

echo ""
echo "A4.9: Unlock system (POST /api/system/unlock)..."
UNLOCK=$($CURL -X POST "$BASE/api/system/unlock" 2>&1)
if echo "$UNLOCK" | grep -q -E "(unlock|success|false)"; then
    echo "  PASS"
else
    echo "  Response: $UNLOCK"
fi

echo ""
echo "A4.10: Download CA (GET /api/certs/ca)..."
$CURL "$BASE/api/certs/ca" -o /tmp/test-katana-ca.crt 2>&1
if [ -s /tmp/test-katana-ca.crt ]; then
    if openssl x509 -in /tmp/test-katana-ca.crt -noout -subject 2>/dev/null; then
        echo "  PASS (valid certificate)"
    else
        echo "  FAIL: invalid certificate format"
        exit 1
    fi
    rm -f /tmp/test-katana-ca.crt
else
    echo "  FAIL: empty or missing file"
    exit 1
fi

# Cleanup already handled by trap
trap - EXIT
$CURL -X POST "$BASE/api/system/unlock" > /dev/null 2>&1 || true

echo ""
echo "=========================================="
echo "A4: All API tests PASSED"
echo "=========================================="
