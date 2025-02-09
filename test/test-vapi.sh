#!/usr/bin/env bash

set -e

# Source common test utilities
source "$(dirname "$0")/lib.sh"

# Install and start the service
install_package vapi
start_package vapi

# Test the endpoint
echo "Testing VAPI endpoint..."
test_endpoint "https://vapi.test:8443/"

# Cleanup
cleanup_package vapi

echo -e "\nPASSED\n"
