#!/usr/bin/env bash

set -e

# Source common test utilities
source "$(dirname "$0")/lib.sh"

# Install and start the service
install_package dojo-basic-lite
start_package dojo-basic-lite

# Test the endpoint
echo "Testing Dojo Basic Lite endpoint..."
test_endpoint "https://dojo-basic.test:8443/"

# Cleanup
cleanup_package dojo-basic-lite

echo -e "\nPASSED\n"
