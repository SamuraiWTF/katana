#!/bin/bash
set -e

# ffuf installation script
# Downloads and installs the latest ffuf release from GitHub

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
info "Fetching latest ffuf release information..."
RELEASE_JSON=$(curl -sSL https://api.github.com/repos/ffuf/ffuf/releases/latest) || error "Failed to fetch release information"

# Parse version
VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name') || error "Failed to parse version"
info "Latest version: $VERSION"

# Find download URL for Linux binary
ASSET_NAME="ffuf_.*_linux_${ARCH}.tar.gz"
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name | test(\"$ASSET_NAME\")) | .browser_download_url") || error "Failed to parse download URL"

if [ -z "$DOWNLOAD_URL" ]; then
    error "Could not find download URL for Linux $ARCH"
fi

info "Download URL: $DOWNLOAD_URL"

# Check if ffuf is already installed
if [ -f /usr/local/bin/ffuf ]; then
    CURRENT_VERSION=$(/usr/local/bin/ffuf -V 2>&1 | head -n1 || echo "unknown")
    warn "ffuf is already installed: $CURRENT_VERSION"
    warn "Overwriting with $VERSION"
fi

# Create temporary directory for download
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Download tarball
info "Downloading ffuf ${VERSION}..."
curl -sSL -o "$TEMP_DIR/ffuf.tar.gz" "$DOWNLOAD_URL" || error "Failed to download ffuf"

# Extract tarball
info "Extracting archive..."
tar -xzf "$TEMP_DIR/ffuf.tar.gz" -C "$TEMP_DIR" || error "Failed to extract archive"

# Find the ffuf binary in extracted files
FFUF_BINARY=$(find "$TEMP_DIR" -name "ffuf" -type f | head -n1)
if [ -z "$FFUF_BINARY" ]; then
    error "Could not find ffuf binary in archive"
fi

# Move to /usr/local/bin
info "Installing to /usr/local/bin/ffuf..."
mv "$FFUF_BINARY" /usr/local/bin/ffuf || error "Failed to install ffuf"
chmod +x /usr/local/bin/ffuf || error "Failed to set executable permission"

# Verify installation
if ! /usr/local/bin/ffuf -V >/dev/null 2>&1; then
    error "ffuf installation verification failed"
fi

info "ffuf ${VERSION} installed successfully"

# Output version for Katana tracking (must be on its own line)
echo "TOOL_VERSION=${VERSION}"
