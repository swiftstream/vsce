#!/usr/bin/bash

set -e

# Install Alibaba Cloud CLI using the official installation script
curl -fsSL https://aliyuncli.alicdn.com/install.sh | bash

# Ensure the `aliyun` command is accessible globally
export PATH="$HOME/.aliyun/bin:$PATH"

# Verify installation
aliyun version