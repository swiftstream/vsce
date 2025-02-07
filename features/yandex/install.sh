#!/usr/bin/bash

set -e

# Detect system architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "x86_64" ]]; then
    YC_ARCH="linux-amd64"
elif [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
    YC_ARCH="linux-arm64"
else
    echo "Unsupported architecture: $ARCH"
    exit 1
fi

# Define Yandex Cloud CLI installation script URL
YC_INSTALL_SCRIPT="https://storage.yandexcloud.net/yandexcloud-yc/install.sh"

echo "Downloading and installing Yandex Cloud CLI (yc) for ${YC_ARCH}..."
curl -fsSL "$YC_INSTALL_SCRIPT" | bash

# Ensure `yc` is available in the system path
export PATH="$HOME/yandex-cloud/bin:$PATH"

# Verify installation
yc version