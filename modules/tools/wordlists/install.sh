#!/bin/bash
set -e

# wordlists (SecLists) installation script for Katana
# Installs SecLists wordlist collection from GitHub

# Color output helpers
info() { echo "[INFO] $1"; }
error() { echo "[ERROR] $1" >&2; exit 1; }
warn() { echo "[WARN] $1" >&2; }

# Check for required tools
command -v git >/dev/null 2>&1 || error "git is required but not installed. Install it with: sudo apt-get install -y git"

# Installation paths
INSTALL_DIR="/usr/share/wordlists"
SECLISTS_SYMLINK="/usr/share/seclists"
OPT_SYMLINK="/opt/wordlists"

# Check if wordlists are already installed
if [ -d "$INSTALL_DIR" ]; then
    info "wordlists are already installed at $INSTALL_DIR"
    if [ -d "$INSTALL_DIR/.git" ]; then
        CURRENT_VERSION=$(git -C "$INSTALL_DIR" describe --tags 2>/dev/null || git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
        warn "Current version: $CURRENT_VERSION"
    fi
    warn "Removing old installation..."
    rm -rf "$INSTALL_DIR"
fi

# Clone the SecLists repository (shallow clone for speed)
info "Cloning SecLists repository from GitHub (this may take 2-3 minutes)..."
if ! git clone --quiet --depth 1 https://github.com/danielmiessler/SecLists.git "$INSTALL_DIR" 2>&1; then
    error "Failed to clone SecLists repository. Check your internet connection and try again."
fi

info "SecLists repository cloned to $INSTALL_DIR"

# Extract version from git tags or commit
if [ -d "$INSTALL_DIR/.git" ]; then
    VERSION=$(git -C "$INSTALL_DIR" describe --tags 2>/dev/null || git -C "$INSTALL_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
    if [ -z "$VERSION" ]; then
        warn "Could not extract version from git, using 'unknown'"
        VERSION="unknown"
    fi
else
    error ".git directory not found in cloned repository at $INSTALL_DIR/.git"
fi

info "Extracted version: $VERSION"

# Create symlinks for compatibility
info "Creating compatibility symlinks..."

# Remove existing symlinks if they exist
[ -L "$SECLISTS_SYMLINK" ] && rm -f "$SECLISTS_SYMLINK"
[ -L "$OPT_SYMLINK" ] && rm -f "$OPT_SYMLINK"

# Create /usr/share/seclists -> /usr/share/wordlists (Kali convention)
ln -s "$INSTALL_DIR" "$SECLISTS_SYMLINK" || warn "Failed to create symlink at $SECLISTS_SYMLINK"
info "Created symlink: $SECLISTS_SYMLINK -> $INSTALL_DIR"

# Create /opt/wordlists -> /usr/share/wordlists (Katana consistency)
ln -s "$INSTALL_DIR" "$OPT_SYMLINK" || warn "Failed to create symlink at $OPT_SYMLINK"
info "Created symlink: $OPT_SYMLINK -> $INSTALL_DIR"

# Verify installation
info "Verifying wordlists installation..."
if [ ! -d "$INSTALL_DIR" ]; then
    error "Installation directory was not created at $INSTALL_DIR"
fi

if [ ! -d "$INSTALL_DIR/Passwords" ]; then
    warn "Expected Passwords directory not found - installation may be incomplete"
fi

info "wordlists (SecLists) $VERSION installed successfully"
echo "TOOL_VERSION=$VERSION"
