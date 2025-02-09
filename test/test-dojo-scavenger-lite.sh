#!/usr/bin/env bash

set -e

# Source common test utilities
source "$(dirname "$0")/lib.sh"

# Install and start the service
install_package dojo-scavenger-lite
start_package dojo-scavenger-lite

# Test the endpoint
echo "Testing Dojo Scavenger Lite endpoint..."
test_endpoint "https://dojo-scavenger.test:8443/"

# Cleanup
cleanup_package dojo-scavenger-lite

echo -e "\nPASSED\n"
