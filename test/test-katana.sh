#!/usr/bin/env bash

set -e

# Source common test utilities
source "$(dirname "$0")/lib.sh"

# Install and start the service
install_package katana
echo "Waiting for installation to complete..."
sleep 5

start_package katana
echo "Waiting for service to initialize..."
sleep 10

# Function to test endpoint with exponential backoff
test_endpoint() {
    local url=$1
    local max_attempts=5
    local attempt=1
    local timeout=10
    
    while [ $attempt -le $max_attempts ]; do
        echo "Testing $url (attempt $attempt/$max_attempts)"
        if curl -s -o /dev/null -w "%{http_code}" $url | grep -q "^[23]"; then
            echo "Success: $url is responding with 2xx/3xx"
            return 0
        fi
        sleep $((2 ** (attempt - 1)))  # Exponential backoff: 1, 2, 4, 8, 16 seconds
        attempt=$((attempt + 1))
    done
    echo "Failed to connect to $url after $max_attempts attempts"
    return 1
}

# Test each endpoint
echo "Testing HTTP endpoint..."
test_endpoint "http://localhost:8087/" || exit 1

echo "Testing HTTPS endpoints..."
test_endpoint "https://katana.test:8443/" -- -k || exit 1
test_endpoint "https://katana.wtf:8443/" -- -k || exit 1

# Cleanup
stop_package katana
echo "Waiting for service to stop..."
sleep 5

remove_package katana

echo -e "\nPASSED\n"
