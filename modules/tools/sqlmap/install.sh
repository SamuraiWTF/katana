#!/bin/bash

# sqlmap installation script for Katana
# Installs sqlmap from source (Python-based tool)

set -e

info() { echo "[INFO] $1"; }
error() { echo "[ERROR] $1" >&2; exit 1; }
warn() { echo "[WARN] $1" >&2; }

# Check for required tools
command -v git >/dev/null 2>&1 || error "git is required but not installed. Install it with: sudo apt-get install -y git"
command -v python3 >/dev/null 2>&1 || error "python3 is required but not installed. Install it with: sudo apt-get install -y python3"

# Installation paths
INSTALL_DIR="/opt/sqlmap"
WRAPPER_SCRIPT="/usr/local/bin/sqlmap"

# Check if sqlmap is already installed
if [ -d "$INSTALL_DIR" ]; then
    info "sqlmap is already installed at $INSTALL_DIR"
    if [ -f "$INSTALL_DIR/lib/core/settings.py" ]; then
        CURRENT_VERSION=$(grep -oP 'VERSION\s*=\s*"\K[0-9.]+(?=")' "$INSTALL_DIR/lib/core/settings.py" 2>/dev/null || echo "unknown")
        warn "Current version: $CURRENT_VERSION"
    fi
    warn "Removing old installation..."
    rm -rf "$INSTALL_DIR"
fi

# Clone the sqlmap repository
info "Cloning sqlmap repository from GitHub..."
if ! git clone --quiet --depth 1 https://github.com/sqlmapproject/sqlmap.git "$INSTALL_DIR" 2>&1; then
    error "Failed to clone sqlmap repository. Check your internet connection and try again."
fi

info "sqlmap repository cloned to $INSTALL_DIR"

# Extract version from lib/core/settings.py
if [ -f "$INSTALL_DIR/lib/core/settings.py" ]; then
    VERSION=$(grep -oP 'VERSION\s*=\s*"\K[0-9.]+(?=")' "$INSTALL_DIR/lib/core/settings.py" 2>/dev/null || echo "")
    if [ -z "$VERSION" ]; then
        warn "Could not extract version from lib/core/settings.py, using 'unknown'"
        VERSION="unknown"
    fi
else
    error "lib/core/settings.py not found in cloned repository at $INSTALL_DIR/lib/core/settings.py"
fi

info "Extracted version: $VERSION"

# Create wrapper script
info "Creating wrapper script at $WRAPPER_SCRIPT..."
cat > "$WRAPPER_SCRIPT" << 'EOF'
#!/bin/bash
# sqlmap wrapper script - installed by Katana
exec python3 /opt/sqlmap/sqlmap.py "$@"
EOF

chmod +x "$WRAPPER_SCRIPT"

# Verify installation
info "Verifying sqlmap installation..."
if [ ! -f "$WRAPPER_SCRIPT" ]; then
    error "Wrapper script was not created at $WRAPPER_SCRIPT"
fi

if [ ! -f "$INSTALL_DIR/sqlmap.py" ]; then
    error "sqlmap.py not found at $INSTALL_DIR/sqlmap.py"
fi

# Test the wrapper (this will show sqlmap's usage/version message)
if ! "$WRAPPER_SCRIPT" --version >/dev/null 2>&1; then
    warn "sqlmap verification test produced an error, but installation may still be successful"
fi

info "sqlmap $VERSION installed successfully"
echo "TOOL_VERSION=$VERSION"
