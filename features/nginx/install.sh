#!/usr/bin/bash

set -e

# Read version from the environment variable (set by devcontainer feature)
NGINX_VERSION="${VERSION:-latest}"

# Update package list and install dependencies
apt-get update && apt-get install -y curl gnupg2 software-properties-common ca-certificates

# Add repository
echo "deb http://nginx.org/packages/ubuntu/ focal nginx
deb-src http://nginx.org/packages/ubuntu/ focal nginx" | tee /etc/apt/sources.list.d/nginx.list

# Add GPG key
curl -fsSL https://nginx.org/keys/nginx_signing.key | apt-key add -

# Update package list again
apt-get update

# Check available versions
AVAILABLE_VERSIONS=$(apt-cache madison nginx | awk '{print $3}')

# Install Nginx with the specified version
if [ "$NGINX_VERSION" = "latest" ]; then
    echo "Installing latest available Nginx version..."
    apt-get install -y nginx
else
    if echo "$AVAILABLE_VERSIONS" | grep -q "^$NGINX_VERSION$"; then
        echo "Installing Nginx version $NGINX_VERSION..."
        apt-get install -y nginx=$NGINX_VERSION*
    else
        echo "Error: Nginx version $NGINX_VERSION is not available in APT repositories."
        echo "Available versions: $AVAILABLE_VERSIONS"
        exit 1
    fi
fi

# Start Nginx
service nginx start || nginx

# Verify installation
nginx -v