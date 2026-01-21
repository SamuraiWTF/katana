#!/bin/bash
set -e

# wordlists (SecLists) removal script for Katana
# Removes SecLists wordlist collection from the system

# Color output helpers
info() { echo "[INFO] $1"; }
warn() { echo "[WARN] $1" >&2; }

# Installation paths
INSTALL_DIR="/usr/share/wordlists"
SECLISTS_SYMLINK="/usr/share/seclists"
OPT_SYMLINK="/opt/wordlists"

# Check if wordlists are installed
if [ ! -d "$INSTALL_DIR" ] && [ ! -L "$SECLISTS_SYMLINK" ] && [ ! -L "$OPT_SYMLINK" ]; then
    warn "wordlists are not installed"
    exit 0
fi

# Remove main installation directory
if [ -d "$INSTALL_DIR" ]; then
    # Safety check: verify it's actually a git repo before removing
    if [ -d "$INSTALL_DIR/.git" ]; then
        info "Removing $INSTALL_DIR..."
        rm -rf "$INSTALL_DIR"
    else
        warn "$INSTALL_DIR exists but is not a git repository - skipping removal for safety"
    fi
fi

# Remove symlinks
if [ -L "$SECLISTS_SYMLINK" ]; then
    info "Removing $SECLISTS_SYMLINK..."
    rm -f "$SECLISTS_SYMLINK"
fi

if [ -L "$OPT_SYMLINK" ]; then
    info "Removing $OPT_SYMLINK..."
    rm -f "$OPT_SYMLINK"
fi

info "wordlists removed successfully"
