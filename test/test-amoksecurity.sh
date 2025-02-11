#!/usr/bin/env bash

set -e

katana install amoksecurity

# Check if the directory exists and is empty
if [ ! -d "/var/www/amoksecurity" ]; then
    echo "Error: /var/www/amoksecurity directory was not created"
    exit 1
fi

# Count files in directory (excluding . and ..)
file_count=$(ls -A /var/www/amoksecurity | wc -l)
if [ "$file_count" -ne 0 ]; then
    echo "Warning: /var/www/amoksecurity is not empty as expected"
fi

# Create a test file
echo "Test content for amoksecurity" | sudo tee /var/www/amoksecurity/test.html > /dev/null

# Function to check HTTP response
check_response() {
    local url=$1
    local expected_code=$2
    local response=$(curl -s -w "%{http_code}" -o /dev/null "$url")
    if [ "$response" = "$expected_code" ]; then
        echo "Success: Got expected $expected_code response from $url"
        return 0
    else
        echo "Error: Expected $expected_code response from $url but got $response"
        return 1
    fi
}

# Test root paths - should get 403
check_response "http://amoksecurity.test:80/" "403" || exit 1
# check_response "http://amoksecurity.wtf:80/" "403" || exit 1

# Test our test file - should get 200
check_response "http://amoksecurity.test:80/test.html" "200" || exit 1
# check_response "http://amoksecurity.wtf:80/test.html" "200" || exit 1

# Verify content of test file
test_content=$(curl -s "http://amoksecurity.test:80/test.html")
if [ "$test_content" != "Test content for amoksecurity" ]; then
    echo "Error: Test file content does not match expected content"
    exit 1
fi

# Clean up
sudo rm /var/www/amoksecurity/test.html

katana remove amoksecurity

# Verify directory is removed during cleanup
if [ -d "/var/www/amoksecurity" ]; then
    echo "Warning: /var/www/amoksecurity directory still exists after removal"
fi

echo -e "\nPASSED\n"
