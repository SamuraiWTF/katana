#!/bin/bash
set -e

# ffuf removal script
# Removes the ffuf binary from /usr/local/bin

# Color output helpers
info() { echo "[INFO] $1"; }
warn() { echo "[WARN] $1" >&2; }

# Check if ffuf is installed
if [ ! -f /usr/local/bin/ffuf ]; then
    warn "ffuf is not installed at /usr/local/bin/ffuf"
    exit 0
fi

# Remove the binary
info "Removing /usr/local/bin/ffuf..."
rm -f /usr/local/bin/ffuf

info "ffuf removed successfully"
