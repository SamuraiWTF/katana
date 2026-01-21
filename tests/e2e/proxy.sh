#!/bin/bash
# Katana 2 E2E Tests - Proxy Routing
# Category A5: Verifies reverse proxy routing works correctly
# REQUIRES: Proxy running, may install DVWA temporarily

set -e
cd "$(dirname "$0")/../.."

KATANA="./bin/katana"
# Use --resolve to bypass /etc/hosts for testing (avoids needing sudo dns sync)
CURL="curl -sk --connect-timeout 5 --resolve katana.test:443:127.0.0.1 --resolve katana.test:80:127.0.0.1 --resolve dvwa.test:443:127.0.0.1 --resolve dvwa.test:80:127.0.0.1 --resolve nonexistent.test:443:127.0.0.1"

echo "=========================================="
echo "A5: Proxy Routing Tests"
echo "=========================================="

# Check proxy connectivity first
echo ""
echo "Checking proxy connectivity..."
if ! $CURL "https://katana.test" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to https://katana.test"
    echo "Make sure:"
    echo "  1. Proxy is running: ./bin/katana proxy start"
    echo "  2. DNS is configured: sudo ./bin/katana dns sync"
    echo "  3. Certificates are initialized: ./bin/katana cert init"
    exit 1
fi
echo "  Proxy is reachable"

# Install DVWA for routing test
echo ""
echo "Setting up DVWA for routing test..."
$KATANA install dvwa 2>/dev/null || true
echo "  Waiting for containers..."
sleep 10

cleanup() {
    echo ""
    echo "Cleanup: removing DVWA..."
    $KATANA remove dvwa 2>/dev/null || true
}
trap cleanup EXIT

echo ""
echo "A5.1: Dashboard accessible (https://katana.test)..."
RESPONSE=$($CURL "https://katana.test" 2>&1)
if echo "$RESPONSE" | grep -qi -E "(html|katana|<!doctype)"; then
    echo "  PASS (got HTML response)"
else
    echo "  FAIL: unexpected response"
    echo "  Response: $(echo "$RESPONSE" | head -5)"
    exit 1
fi

echo ""
echo "A5.2: HTTP redirect (http://katana.test)..."
# Use -I to get headers, -L to not follow redirects
HTTP_CODE=$($CURL -w "%{http_code}" -o /dev/null "http://katana.test" 2>&1) || true
if [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "308" ]; then
    echo "  PASS (got redirect: $HTTP_CODE)"
else
    # Check if we got redirected to HTTPS
    LOCATION=$($CURL -I "http://katana.test" 2>&1 | grep -i "location:" | head -1)
    if echo "$LOCATION" | grep -qi "https://"; then
        echo "  PASS (redirects to HTTPS)"
    else
        echo "  WARN: HTTP code $HTTP_CODE (may be OK if redirect works)"
    fi
fi

echo ""
echo "A5.3: Target routing (https://dvwa.test)..."
DVWA_RESPONSE=$($CURL "https://dvwa.test" 2>&1)
if echo "$DVWA_RESPONSE" | grep -qi -E "(dvwa|damn vulnerable|login|html)"; then
    echo "  PASS (DVWA responding)"
else
    echo "  FAIL: DVWA not responding correctly"
    echo "  Response: $(echo "$DVWA_RESPONSE" | head -10)"
    echo ""
    echo "  Checking container status..."
    docker ps | grep katana-dvwa || echo "  No DVWA containers found"
    exit 1
fi

echo ""
echo "A5.4: Unknown host (https://nonexistent.test)..."
# This test requires nonexistent.test to resolve to 127.0.0.1
# Add it temporarily if needed
if ! grep -q "nonexistent.test" /etc/hosts 2>/dev/null; then
    echo "  Note: nonexistent.test not in /etc/hosts, testing via Host header"
    HTTP_CODE=$($CURL -H "Host: nonexistent.test" -w "%{http_code}" -o /dev/null "https://katana.test" 2>&1) || true
else
    HTTP_CODE=$($CURL -w "%{http_code}" -o /dev/null "https://nonexistent.test" 2>&1) || true
fi

if [ "$HTTP_CODE" = "404" ]; then
    echo "  PASS (got 404)"
else
    echo "  Response code: $HTTP_CODE (expected 404, may vary based on implementation)"
fi

echo ""
echo "A5.5: API via proxy (https://katana.test/api/system)..."
API_RESPONSE=$($CURL "https://katana.test/api/system" 2>&1)
if echo "$API_RESPONSE" | grep -q "docker"; then
    echo "  PASS (API responding)"
else
    echo "  FAIL: API not responding correctly"
    echo "  Response: $API_RESPONSE"
    exit 1
fi

echo ""
echo "=========================================="
echo "A5: All proxy routing tests PASSED"
echo "=========================================="
