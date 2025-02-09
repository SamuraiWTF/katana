#!/usr/bin/env bash

set -e

# Source common test utilities
source "$(dirname "$0")/lib.sh"

# Install and start the service
install_package musashi
start_package musashi 15  # Musashi needs a bit longer to start up

# Test each endpoint
echo "Testing HTTP endpoint..."
test_endpoint "http://localhost:8088/"

echo "Testing HTTPS endpoint..."
test_endpoint "https://musashi.test:8443/" -- -k

# Cleanup
cleanup_package musashi

echo -e "\nPASSED\n"
