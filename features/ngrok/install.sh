#!/usr/bin/bash

set -e

# Read version from the environment variable (set by devcontainer feature)
NGROK_VERSION="${VERSION:-3.7.1}"

# Detect system architecture (amd64 or arm64)
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    ARCH="amd64"
elif [[ "$ARCH" == "aarch64" ]]; then
    ARCH="arm64"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

# Download ngrok binary with the specified version
echo "Downloading ngrok $NGROK_VERSION for $ARCH..."
curl -fsSL -o ngrok.zip "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v$NGROK_VERSION-linux-$ARCH.zip"

# Extract and move ngrok binary
echo "Extracting ngrok..."
unzip ngrok.zip
chmod +x ngrok
mv ngrok /usr/local/bin/

# Clean up
rm -f ngrok.zip

# Verify installation
ngrok version