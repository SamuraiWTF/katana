#!/usr/bin/env bash

# Common test utilities for Katana test scripts

# Test an HTTP endpoint with exponential backoff
# Arguments:
#   $1: URL to test
#   $2: Expected status code (optional, accepts 2xx/3xx if not specified)
#   Additional flags can be passed after -- e.g., test_endpoint "https://example.com" 200 -- -k
test_endpoint() {
    local url=$1
    local expected_code=$2
    local max_attempts=5
    local attempt=1
    local timeout=10
    local curl_flags="--fail --max-time $timeout"  # Always use --fail and timeout
    
    # If we find -- in the arguments, everything after it becomes additional curl flags
    local found_separator=false
    for arg in "${@:3}"; do
        if [ "$arg" = "--" ]; then
            found_separator=true
            continue
        fi
        if [ "$found_separator" = true ]; then
            curl_flags="$curl_flags $arg"
        fi
    done
    
    while [ $attempt -le $max_attempts ]; do
        echo "Testing $url (attempt $attempt/$max_attempts)"
        
        # Use curl in a way that captures both status code and connection errors
        local output
        local status
        output=$(curl -s -w "\n%{http_code}" $curl_flags "$url" 2>&1)
        status=$?
        
        # Extract the status code from the last line
        local response=$(echo "$output" | tail -n1)
        local content=$(echo "$output" | sed '$d')
        
        # Check for curl errors (connection refused, timeout, etc.)
        if [ $status -ne 0 ]; then
            echo "Connection failed: $content"
            if [ $attempt -eq $max_attempts ]; then
                return 1
            fi
            sleep $((2 ** (attempt - 1)))  # Exponential backoff: 1, 2, 4, 8, 16 seconds
            attempt=$((attempt + 1))
            continue
        fi
        
        if [ -n "$expected_code" ]; then
            # Check for exact status code match
            if [ "$response" = "$expected_code" ]; then
                echo "Success: $url responded with expected status $expected_code"
                return 0
            fi
        else
            # Accept any 2xx or 3xx response
            if echo "$response" | grep -q "^[23]"; then
                echo "Success: $url responded with status $response"
                return 0
            fi
        fi
        
        echo "Got unexpected status code: $response"
        sleep $((2 ** (attempt - 1)))  # Exponential backoff: 1, 2, 4, 8, 16 seconds
        attempt=$((attempt + 1))
    done
    
    echo "Failed to get expected response from $url after $max_attempts attempts"
    return 1
}

# Wait for service to be ready
# Arguments:
#   $1: Service name (for logging)
#   $2: Number of seconds to wait
wait_for_service() {
    local service_name=$1
    local wait_time=${2:-10}  # Default to 10 seconds if not specified
    
    echo "Waiting $wait_time seconds for $service_name to initialize..."
    sleep "$wait_time"
}

# Standard installation wrapper
# Arguments:
#   $1: Package name
#   $2: Initial wait time (optional, defaults to 5)
install_package() {
    local package_name=$1
    local wait_time=${2:-5}  # Default to 5 seconds if not specified
    
    echo "Installing $package_name..."
    katana install "$package_name"
    wait_for_service "$package_name installation" "$wait_time"
}

# Standard start wrapper
# Arguments:
#   $1: Package name
#   $2: Initial wait time (optional, defaults to 10)
start_package() {
    local package_name=$1
    local wait_time=${2:-10}  # Default to 10 seconds if not specified
    
    echo "Starting $package_name..."
    katana start "$package_name"
    wait_for_service "$package_name startup" "$wait_time"
}

# Standard cleanup wrapper
# Arguments:
#   $1: Package name
#   $2: Wait time before removal (optional, defaults to 5)
cleanup_package() {
    local package_name=$1
    local wait_time=${2:-5}  # Default to 5 seconds if not specified
    
    echo "Stopping $package_name..."
    katana stop "$package_name"
    wait_for_service "$package_name shutdown" "$wait_time"
    
    echo "Removing $package_name..."
    katana remove "$package_name"
}
