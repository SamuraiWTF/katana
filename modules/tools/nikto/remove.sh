#!/bin/bash

# Nikto removal script for Katana
# Removes Nikto installation from the system

set -e

info() { echo "[INFO] $1"; }
warn() { echo "[WARN] $1" >&2; }

# Installation paths
INSTALL_DIR="/opt/nikto"
WRAPPER_SCRIPT="/usr/local/bin/nikto"

# Check if nikto is installed
if [ ! -d "$INSTALL_DIR" ] && [ ! -f "$WRAPPER_SCRIPT" ]; then
    warn "nikto is not installed"
    exit 0
fi

# Remove source directory
if [ -d "$INSTALL_DIR" ]; then
    info "Removing $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
fi

# Remove wrapper script
if [ -f "$WRAPPER_SCRIPT" ]; then
    info "Removing $WRAPPER_SCRIPT..."
    rm -f "$WRAPPER_SCRIPT"
fi

info "nikto removed successfully"
