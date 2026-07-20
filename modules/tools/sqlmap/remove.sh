#!/bin/bash

# sqlmap removal script for Katana
# Removes sqlmap installation from the system

set -e

info() { echo "[INFO] $1"; }
warn() { echo "[WARN] $1" >&2; }

# Installation paths
INSTALL_DIR="/opt/sqlmap"
WRAPPER_SCRIPT="/usr/local/bin/sqlmap"

# Check if sqlmap is installed
if [ ! -d "$INSTALL_DIR" ] && [ ! -f "$WRAPPER_SCRIPT" ]; then
    warn "sqlmap is not installed"
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

info "sqlmap removed successfully"
