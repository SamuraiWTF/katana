#!/usr/bin/env bash

set -e

# Source common test utilities
source "$(dirname "$0")/lib.sh"

# Install and start the service
install_package musashi
start_package musashi 15  # Musashi needs a bit longer to start up

# Test each endpoint
echo "Testing CORS Client endpoint..."
test_endpoint "https://cors-dojo.test:8443/"

echo "Testing CORS API endpoint..."
test_endpoint "https://api.cors.test:8443/" 404 -- --no-fail

echo "Testing JWT Demo endpoint..."
test_endpoint "https://jwt-demo.test:8443/"

echo "Testing CSP Demo endpoint..."
test_endpoint "https://csp-dojo.test:8443/"

# Cleanup
cleanup_package musashi

echo -e "\nPASSED\n"
