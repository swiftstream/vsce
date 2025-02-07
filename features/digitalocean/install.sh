#!/usr/bin/bash

set -e

# Detect system architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    DOCTL_ARCH="linux-amd64"
elif [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    DOCTL_ARCH="linux-arm64"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

# Get the latest release version of doctl
DOCTL_VERSION=$(curl -s https://api.github.com/repos/digitalocean/doctl/releases/latest | grep '"tag_name":' | cut -d '"' -f 4 | sed 's/v//')

# Define download URL
DOCTL_URL="https://github.com/digitalocean/doctl/releases/download/v${DOCTL_VERSION}/doctl-${DOCTL_VERSION}-${DOCTL_ARCH}.tar.gz"

echo "Downloading DigitalOcean CLI (doctl) version ${DOCTL_VERSION} for ${DOCTL_ARCH}..."
curl -fsSL -o doctl.tar.gz "$DOCTL_URL"

# Extract and install doctl
tar -xzf doctl.tar.gz
chmod +x doctl
mv doctl /usr/local/bin/doctl
rm doctl.tar.gz

# Verify installation
doctl version