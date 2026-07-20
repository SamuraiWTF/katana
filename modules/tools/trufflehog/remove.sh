#!/bin/bash
set -e

# trufflehog removal script
# Removes the trufflehog binary from /usr/local/bin

# Color output helpers
info() { echo "[INFO] $1"; }
warn() { echo "[WARN] $1" >&2; }

# Check if trufflehog is installed
if [ ! -f /usr/local/bin/trufflehog ]; then
    warn "trufflehog is not installed at /usr/local/bin/trufflehog"
    exit 0
fi

# Remove the binary
info "Removing /usr/local/bin/trufflehog..."
rm -f /usr/local/bin/trufflehog

info "trufflehog removed successfully"
