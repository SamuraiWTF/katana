#!/bin/bash
set -e

# trufflehog installation script
# Downloads and installs the latest trufflehog release from GitHub

# Color output helpers
info() { echo "[INFO] $1"; }
error() { echo "[ERROR] $1" >&2; exit 1; }
warn() { echo "[WARN] $1" >&2; }

# Check for required tools
command -v curl >/dev/null 2>&1 || error "curl is required but not installed"
command -v jq >/dev/null 2>&1 || error "jq is required but not installed"
command -v tar >/dev/null 2>&1 || error "tar is required but not installed"

# Detect architecture
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH="amd64"
        ;;
    aarch64|arm64)
        ARCH="arm64"
        ;;
    *)
        error "Unsupported architecture: $ARCH"
        ;;
esac

info "Detected architecture: $ARCH"

# Fetch latest release info from GitHub API
info "Fetching latest trufflehog release information..."
RELEASE_JSON=$(curl -sSL https://api.github.com/repos/trufflesecurity/trufflehog/releases/latest) || error "Failed to fetch release information"

# Parse version
VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name') || error "Failed to parse version"
info "Latest version: $VERSION"

# Find download URL for Linux binary
ASSET_NAME="trufflehog_.*_linux_${ARCH}.tar.gz"
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name | test(\"$ASSET_NAME\")) | .browser_download_url") || error "Failed to parse download URL"

if [ -z "$DOWNLOAD_URL" ]; then
    error "Could not find download URL for Linux $ARCH"
fi

info "Download URL: $DOWNLOAD_URL"

# Check if trufflehog is already installed
if [ -f /usr/local/bin/trufflehog ]; then
    CURRENT_VERSION=$(/usr/local/bin/trufflehog --version 2>&1 | head -n1 || echo "unknown")
    warn "trufflehog is already installed: $CURRENT_VERSION"
    warn "Overwriting with $VERSION"
fi

# Create temporary directory for download
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Download tarball
info "Downloading trufflehog ${VERSION}..."
curl -sSL -o "$TEMP_DIR/trufflehog.tar.gz" "$DOWNLOAD_URL" || error "Failed to download trufflehog"

# Extract tarball
info "Extracting archive..."
tar -xzf "$TEMP_DIR/trufflehog.tar.gz" -C "$TEMP_DIR" || error "Failed to extract archive"

# Find the trufflehog binary in extracted files
TRUFFLEHOG_BINARY=$(find "$TEMP_DIR" -name "trufflehog" -type f | head -n1)
if [ -z "$TRUFFLEHOG_BINARY" ]; then
    error "Could not find trufflehog binary in archive"
fi

# Move to /usr/local/bin
info "Installing to /usr/local/bin/trufflehog..."
mv "$TRUFFLEHOG_BINARY" /usr/local/bin/trufflehog || error "Failed to install trufflehog"
chmod +x /usr/local/bin/trufflehog || error "Failed to set executable permission"

# Verify installation
if ! /usr/local/bin/trufflehog --version >/dev/null 2>&1; then
    error "trufflehog installation verification failed"
fi

info "trufflehog ${VERSION} installed successfully"

# Output version for Katana tracking (must be on its own line)
echo "TOOL_VERSION=${VERSION}"
