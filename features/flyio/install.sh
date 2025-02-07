#!/usr/bin/bash

set -e

echo "Installing Fly.io CLI (flyctl) using the official script..."

# Run Fly.io's official installation script
curl -L https://fly.io/install.sh | sh

# Ensure flyctl is available in PATH
export PATH="$HOME/.fly/bin:$PATH"

# Ensure PATH is available in future VS Code Dev Container shells
echo 'export PATH="/root/.fly/bin:$PATH"' >> /etc/bash.bashrc

# Verify installation
flyctl version