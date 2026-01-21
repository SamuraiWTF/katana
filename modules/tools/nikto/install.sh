#!/bin/bash

# Nikto installation script for Katana
# Installs Nikto from source (Perl-based tool)

set -e

info() { echo "[INFO] $1"; }
error() { echo "[ERROR] $1" >&2; exit 1; }
warn() { echo "[WARN] $1" >&2; }

# Check for required tools
command -v git >/dev/null 2>&1 || error "git is required but not installed. Install it with: sudo apt-get install -y git"
command -v perl >/dev/null 2>&1 || error "perl is required but not installed. Install it with: sudo apt-get install -y perl"

# Check for Perl SSL module (required for HTTPS scanning)
info "Checking for Perl SSL/TLS support..."
if ! perl -MNet::SSLeay -e 'exit(0)' >/dev/null 2>&1; then
    warn "Net::SSLeay Perl module not found. Installing libnet-ssleay-perl..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq >/dev/null 2>&1 || warn "apt-get update failed, continuing anyway"
        apt-get install -y libnet-ssleay-perl >/dev/null 2>&1 || warn "Could not install libnet-ssleay-perl. Nikto may not work with HTTPS targets."
    else
        warn "apt-get not available. Please install libnet-ssleay-perl manually for HTTPS support."
    fi
fi

# Installation paths
INSTALL_DIR="/opt/nikto"
WRAPPER_SCRIPT="/usr/local/bin/nikto"

# Check if nikto is already installed
if [ -d "$INSTALL_DIR" ]; then
    info "nikto is already installed at $INSTALL_DIR"
    if [ -f "$INSTALL_DIR/program/nikto.pl" ]; then
        CURRENT_VERSION=$(grep "\$VARIABLES{'version'}" "$INSTALL_DIR/program/nikto.pl" 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "unknown")
        warn "Current version: $CURRENT_VERSION"
    fi
    warn "Removing old installation..."
    rm -rf "$INSTALL_DIR"
fi

# Clone the Nikto repository
info "Cloning Nikto repository from GitHub..."
if ! git clone --quiet --depth 1 https://github.com/sullo/nikto.git "$INSTALL_DIR" 2>&1; then
    error "Failed to clone Nikto repository. Check your internet connection and try again."
fi

info "Nikto repository cloned to $INSTALL_DIR"

# Extract version from nikto.pl
if [ -f "$INSTALL_DIR/program/nikto.pl" ]; then
    VERSION=$(grep "\$VARIABLES{'version'}" "$INSTALL_DIR/program/nikto.pl" 2>/dev/null | grep -oP '\d+\.\d+\.\d+' || echo "")
    if [ -z "$VERSION" ]; then
        warn "Could not extract version from nikto.pl, using 'unknown'"
        VERSION="unknown"
    fi
else
    error "nikto.pl not found in cloned repository at $INSTALL_DIR/program/nikto.pl"
fi

info "Extracted version: $VERSION"

# Create wrapper script
info "Creating wrapper script at $WRAPPER_SCRIPT..."
cat > "$WRAPPER_SCRIPT" << 'EOF'
#!/bin/bash
# Nikto wrapper script - installed by Katana
exec perl /opt/nikto/program/nikto.pl "$@"
EOF

chmod +x "$WRAPPER_SCRIPT"

# Verify installation
info "Verifying nikto installation..."
if [ ! -f "$WRAPPER_SCRIPT" ]; then
    error "Wrapper script was not created at $WRAPPER_SCRIPT"
fi

if [ ! -f "$INSTALL_DIR/program/nikto.pl" ]; then
    error "nikto.pl not found at $INSTALL_DIR/program/nikto.pl"
fi

# Test the wrapper (this will show nikto's usage/version message)
if ! "$WRAPPER_SCRIPT" -Version >/dev/null 2>&1; then
    warn "nikto verification test produced an error, but installation may still be successful"
fi

info "nikto $VERSION installed successfully"
echo "TOOL_VERSION=$VERSION"
