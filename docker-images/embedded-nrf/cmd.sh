#!/bin/bash

source /usr/local/bin/dev-base.sh

echo -e "🔧 ${BLUE}${BOLD}Checking for Zephyr configuration...${NC}"

PROJECT_DIR="$PWD"
ZEPHYR_DIR="/workspaces"

# Only initialize west if not already initialized
if [ ! -f "$ZEPHYR_DIR/.west/config" ]; then
    echo -e "🔧 ${BLUE}Initializing Zephyr workspace${NC}"
    west init -l
else
    echo -e "✅ ${GREEN}Zephyr already initialized in ${NC}$ZEPHYR_DIR"
fi

echo -e "📦 ${YELLOW}Configuring Zephyr...${NC}"

cd "$ZEPHYR_DIR"
west update
west zephyr-export
find . -type f -name 'requirements.txt' -print0 | xargs -0 -n1 -I{} pip3 install --break-system-packages -r "{}"

# Install Zephyr SDK
cd ${ZEPHYR_DIR}/zephyr
west sdk install

# Prepare .bashrc
BASHRC=/root/.bashrc

ZEPHYR_PATH=/workspaces/zephyr/include

# Check if ORIGINAL_PATH is already saved
if ! grep -q '^# ORIGINAL_PATH=' "$BASHRC"; then
  echo "# ORIGINAL_PATH=$PATH" >> "$BASHRC"
fi

# Extract saved ORIGINAL_PATH from .bashrc
ORIGINAL_PATH=$(grep '^# ORIGINAL_PATH=' "$BASHRC" | head -n1 | cut -d= -f2-)

# Combine original path with extras
COMBINED_PATH="$ZEPHYR_PATH:$ORIGINAL_PATH"

# Rewrite PATH
sed -i '/^export PATH=/d' "$BASHRC"
echo "export PATH=$COMBINED_PATH" >> "$BASHRC"

echo -e "👍 ${BOLD}All done!${NC}"