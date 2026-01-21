#!/bin/bash
# Katana 2 E2E Tests - Master Runner
# Runs all automated tests in sequence

set -e
cd "$(dirname "$0")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
SKIPPED=0

# Results array
declare -a RESULTS

run_test() {
    local name=$1
    local script=$2
    local requires_proxy=${3:-false}

    echo ""
    echo "============================================"
    echo "Running: $name"
    echo "============================================"

    if [ "$requires_proxy" = "true" ]; then
        # Check if proxy is running (use --resolve to bypass /etc/hosts)
        if ! curl -sk --connect-timeout 2 --resolve katana.test:443:127.0.0.1 "https://katana.test" > /dev/null 2>&1; then
            echo -e "${YELLOW}SKIPPED${NC}: Proxy not running"
            RESULTS+=("$name: SKIPPED (proxy required)")
            SKIPPED=$((SKIPPED + 1))
            return
        fi
    fi

    if bash "$script"; then
        echo -e "${GREEN}PASSED${NC}: $name"
        RESULTS+=("$name: PASSED")
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAILED${NC}: $name"
        RESULTS+=("$name: FAILED")
        FAILED=$((FAILED + 1))
    fi
}

echo "=========================================="
echo "Katana 2 End-to-End Test Suite"
echo "=========================================="
echo "Date: $(date)"
echo "Working directory: $(pwd)"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v bun &> /dev/null; then
    echo "ERROR: bun is not installed"
    exit 1
fi
echo "  Bun: $(bun --version)"

if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running"
    exit 1
fi
echo "  Docker: OK"

if [ ! -f "../bin/katana" ] && [ ! -f "../../bin/katana" ]; then
    echo "  Katana binary: Not found (will be built)"
else
    echo "  Katana binary: OK"
fi

echo ""
echo "Starting tests..."

# Run tests in sequence
# A1: Build (no proxy required)
run_test "A1: Build Verification" "build.sh" false

# A2: CLI Commands (no proxy required)
run_test "A2: CLI Commands" "cli.sh" false

# A6: State Management (no proxy required)
run_test "A6: State Management" "state.sh" false

# A3: Target Lifecycle (no proxy required, but needs Docker)
run_test "A3: Target Lifecycle" "lifecycle.sh" false

# A4: API Endpoints (requires proxy)
run_test "A4: API Endpoints" "api.sh" true

# A5: Proxy Routing (requires proxy)
run_test "A5: Proxy Routing" "proxy.sh" true

# Summary
echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo ""

for result in "${RESULTS[@]}"; do
    if [[ $result == *"PASSED"* ]]; then
        echo -e "${GREEN}[PASS]${NC} ${result%: PASSED}"
    elif [[ $result == *"FAILED"* ]]; then
        echo -e "${RED}[FAIL]${NC} ${result%: FAILED}"
    else
        echo -e "${YELLOW}[SKIP]${NC} ${result%: SKIPPED*}"
    fi
done

echo ""
echo "----------------------------------------"
echo -e "Passed:  ${GREEN}$PASSED${NC}"
echo -e "Failed:  ${RED}$FAILED${NC}"
echo -e "Skipped: ${YELLOW}$SKIPPED${NC}"
echo "----------------------------------------"

if [ $FAILED -gt 0 ]; then
    echo ""
    echo -e "${RED}Some tests FAILED${NC}"
    exit 1
else
    echo ""
    echo -e "${GREEN}All tests PASSED${NC}"
    exit 0
fi
