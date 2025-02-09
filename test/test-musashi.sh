#!/usr/bin/env bash

set -e

katana install musashi
echo "Waiting for installation to complete..."
sleep 5  # Give more time for installation to settle

katana start musashi
echo "Waiting for services to start..."
sleep 10  # Give more time for all services to initialize

# Function to test endpoint with exponential backoff
test_endpoint() {
    local url=$1
    local max_attempts=5
    local attempt=1
    local timeout=5
    
    while [ $attempt -le $max_attempts ]; do
        echo "Testing $url (attempt $attempt/$max_attempts)"
        if curl --fail -o /dev/null --max-time $timeout "$url" 2>/dev/null; then
            return 0
        fi
        sleep $((2 ** (attempt - 1)))  # Exponential backoff: 1, 2, 4, 8, 16 seconds
        attempt=$((attempt + 1))
    done
    echo "Failed to connect to $url after $max_attempts attempts"
    return 1
}

# Test each endpoint
echo "Testing jwt-demo endpoints..."
test_endpoint "http://localhost:3050/" || exit 1
test_endpoint "https://jwt-demo.test:8443/" -k || exit 1

echo "Testing csp-dojo endpoints..."
test_endpoint "http://localhost:3041/" || exit 1
test_endpoint "https://csp-dojo.test:8443/" -k || exit 1

echo "Testing api.cors endpoints..."
test_endpoint "http://localhost:3020/" || exit 1
test_endpoint "https://api.cors.test:8443/" -k || exit 1

echo "Testing cors-dojo endpoints..."
test_endpoint "http://localhost:3021/" || exit 1
test_endpoint "https://cors-dojo.test:8443/" -k || exit 1

katana stop musashi
sleep 5  # Give more time for cleanup
katana remove musashi

echo -e "\nPASSED\n"
