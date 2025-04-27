#!/bin/bash

source /usr/local/bin/dev-base.sh

# Pico-SDK

PICO_SDK_VERSION="${PICO_SDK_VERSION:-2.1.1}"
RASPBERRY_VOLUME="${RASPBERRY_VOLUME:-"/embedded/raspberry"}"
PICO_SDK_PATH="${RASPBERRY_VOLUME}/pico-sdk"

echo -e "📥 ${BLUE}Preparing Pico SDK ${BOLD}v${PICO_SDK_VERSION}${NORM}${NC}"

if [ -d "$PICO_SDK_PATH" ] && [ -f "$PICO_SDK_PATH/CMakeLists.txt" ]; then
    echo -e "✅ Pico SDK ${BOLD}v${PICO_SDK_VERSION}${NORM} ${GREEN}already installed${NC}"
else
    echo -e "🚀 ${BLUE}${BOLD}Downloading pico-sdk-${PICO_SDK_VERSION}${NORM}..."
    
    # Clean pico-sdk directory
    rm -rf "${PICO_SDK_PATH:?}/"* "${PICO_SDK_PATH:?}"/.[!.]* 2>/dev/null || true
    
    # Clone with submodules
    git clone --branch "$PICO_SDK_VERSION" --depth 1 --recurse-submodules https://github.com/raspberrypi/pico-sdk.git "$PICO_SDK_PATH"

    echo -e "✅ ${GREEN}Pico SDK installed to ${PICO_SDK_PATH}${NC}"
fi

# Picotool

PICO_TOOL_PATH="${RASPBERRY_VOLUME}/picotool"

PICOTOOL_VERSION_INSTALLED=$(picotool version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [ "$PICOTOOL_VERSION_INSTALLED" = "$PICO_SDK_VERSION" ]; then
    echo -e "✅ Picotool ${BOLD}v${PICOTOOL_VERSION_INSTALLED}${NORM} ${GREEN}already installed${NC}"
else
    echo -e "📥 ${BLUE}Installing Picotool ${BOLD}v${PICO_SDK_VERSION}${NORM}${NC}"
    
    # Clean old picotool directory
    rm -rf "${PICO_TOOL_PATH:?}"

    # Clone and build
    git clone https://github.com/raspberrypi/picotool.git "$PICO_TOOL_PATH"
    mkdir -p "$PICO_TOOL_PATH/build"
    cd "$PICO_TOOL_PATH/build"

    cmake -DPICO_SDK_PATH="$PICO_SDK_PATH" ..
    make -j$(nproc)
    make install

    cd /
    echo -e "✅ ${GREEN}Picotool installed${NC}"
fi

# Prepare .bashrc
BASHRC=/root/.bashrc

# Rewrite PICO_SDK_PATH
sed -i '/^export PICO_SDK_PATH=/d' "$BASHRC"
echo "export PICO_SDK_PATH=$PICO_SDK_PATH" >> "$BASHRC"

echo -e "👍 ${BOLD}All done!${NC}"