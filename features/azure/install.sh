#!/usr/bin/bash

set -e

echo "Installing Azure CLI (az) using Microsoft's official APT repository..."

# Ensure required dependencies are installed
apt-get update && apt-get install -y ca-certificates curl apt-transport-https lsb-release gnupg

# Import Microsoft signing key
curl -sLS https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor | tee /usr/share/keyrings/microsoft-archive-keyring.gpg > /dev/null

# Add the Azure CLI APT repository
AZ_REPO=$(lsb_release -cs)
echo "deb [signed-by=/usr/share/keyrings/microsoft-archive-keyring.gpg] https://packages.microsoft.com/repos/azure-cli/ $AZ_REPO main" | tee /etc/apt/sources.list.d/azure-cli.list

# Install Azure CLI
apt-get update && apt-get install -y azure-cli

# Verify installation
az version