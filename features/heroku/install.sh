#!/usr/bin/bash

set -e

# Ensure NVM is loaded
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "Node.js is not available in PATH. Ensure it's installed in the base image."
    exit 1
fi

# Install Heroku CLI
curl -fsSL https://cli-assets.heroku.com/install.sh | sh

# Verify installation
heroku --version