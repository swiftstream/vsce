#!/bin/bash

source /usr/local/bin/dev-base.sh

# ESP-IDF

IDF_PY="${IDF_PATH}/tools/idf.py"

if [[ "$IDF_CHIP_TARGETS" == "all" || "$IDF_CHIP_TARGETS" == *,* ]]; then
  TARGETS_ENDING="targets"
else
  TARGETS_ENDING="target"
fi

echo -e "📥 ${BLUE}Preparing ESP-IDF ${BOLD}v${IDF_VERSION}${NORM} ${BLUE}for ${BOLD}${IDF_CHIP_TARGETS}${NC}${BLUE} chip ${TARGETS_ENDING}${NC}"

IDF_ALREADY_INSTALLED=false

while true; do

    # Check if already installed and version matches
    if [ -f "$IDF_PY" ]; then
        . "${IDF_PATH}/export.sh" > /dev/null 2>&1
        INSTALLED_VERSION=$("$IDF_PY" --version 2>/dev/null || echo "")
        if [[ "$INSTALLED_VERSION" == *"v$IDF_VERSION"* ]]; then
            echo -e "✅ ESP-IDF ${BOLD}v${IDF_VERSION}${NORM} ${GREEN}already installed!${NC}"
            IDF_ALREADY_INSTALLED=true
            break
        else
            if [ -n "$INSTALLED_VERSION" ]; then
                echo -e "❗️ ${YELLOW}Current version: ${BOLD}${INSTALLED_VERSION}${NORM}"
            fi
            echo -e "🚀 ${BLUE}${BOLD}Let's install v${IDF_VERSION}${NORM}"
        fi
    fi

    # Clean esp directory
    rm -rf "${IDF_PATH:?}/"* "${IDF_PATH:?}"/.[!.]* 2>/dev/null || true

    # Clone ESP-IDF
    git clone -b "release/v${IDF_VERSION}" --recursive https://github.com/espressif/esp-idf.git "$IDF_PATH"

    echo -e "⚙️ ${BLUE}Executing ${BOLD}install.sh${NORM} ${BLUE}script${NC}"

    # Install the tools for all targets
    "$IDF_PATH/install.sh" "${IDF_CHIP_TARGETS}" > /dev/null
    break
done

# Prepare .bashrc
BASHRC=/root/.bashrc

# Dynamically resolved versions
GDB_VERSION=$(basename "$(find ${IDF_TOOLS_PATH}/tools/riscv32-esp-elf-gdb/ -mindepth 1 -maxdepth 1 -type d | head -n 1)")
GCC_VERSION=$(basename "$(find ${IDF_TOOLS_PATH}/tools/riscv32-esp-elf/ -mindepth 1 -maxdepth 1 -type d | head -n 1)")
OPENOCD_VERSION=$(basename "$(find ${IDF_TOOLS_PATH}/tools/openocd-esp32/ -mindepth 1 -maxdepth 1 -type d | head -n 1)")
PYTHON_ENV_VERSION=$(basename "$(find ${IDF_TOOLS_PATH}/python_env/ -mindepth 1 -maxdepth 1 -type d | head -n 1)")
ESP_ROM_ELF=$(basename "$(find ${IDF_TOOLS_PATH}/tools/esp-rom-elfs/ -mindepth 1 -maxdepth 1 -type d | head -n 1)")

# Static esp-idf path components
PATH_ESPCOREDUMP="${IDF_PATH}/components/espcoredump"
PATH_PARTITION_TABLE="${IDF_PATH}/components/partition_table"
PATH_APP_UPDATE="${IDF_PATH}/components/app_update"
PATH_GDB="${IDF_TOOLS_PATH}/tools/riscv32-esp-elf-gdb/${GDB_VERSION}/riscv32-esp-elf-gdb/bin"
PATH_GCC="${IDF_TOOLS_PATH}/tools/riscv32-esp-elf/${GCC_VERSION}/riscv32-esp-elf/bin"
PATH_OPENOCD="${IDF_TOOLS_PATH}/tools/openocd-esp32/${OPENOCD_VERSION}/openocd-esp32/bin"
PATH_PYTHON_ENV="${IDF_TOOLS_PATH}/python_env/${PYTHON_ENV_VERSION}/bin"
PATH_TOOLS="${IDF_PATH}/tools"

# Final combined esp-idf path
IDF_PATHS="${PATH_ESPCOREDUMP}:${PATH_PARTITION_TABLE}:${PATH_APP_UPDATE}:${PATH_GDB}:${PATH_GCC}:${PATH_OPENOCD}:${PATH_PYTHON_ENV}:${PATH_TOOLS}"

IDF_PYTHON_ENV_PATH="${IDF_TOOLS_PATH}/python_env/${PYTHON_ENV_VERSION}"
ESP_ROM_ELF_DIR="${IDF_TOOLS_PATH}/esp-rom-elfs/${ESP_ROM_ELF}"

# Rewrite IDF_PYTHON_ENV_PATH
sed -i '/^export IDF_PYTHON_ENV_PATH=/d' "$BASHRC"
echo "export IDF_PYTHON_ENV_PATH=$IDF_PYTHON_ENV_PATH" >> "$BASHRC"

# Rewrite ESP_ROM_ELF_DIR
sed -i '/^export ESP_ROM_ELF_DIR=/d' "$BASHRC"
echo "export ESP_ROM_ELF_DIR=$ESP_ROM_ELF_DIR" >> "$BASHRC"

# Check if ORIGINAL_PATH is already saved
if ! grep -q '^# ORIGINAL_PATH=' "$BASHRC"; then
  echo "# ORIGINAL_PATH=$PATH" >> "$BASHRC"
fi

# Extract saved ORIGINAL_PATH from .bashrc
ORIGINAL_PATH=$(grep '^# ORIGINAL_PATH=' "$BASHRC" | head -n1 | cut -d= -f2-)

# Combine original path with extras
COMBINED_PATH="$IDF_PATHS:$ORIGINAL_PATH"

# Rewrite PATH
sed -i '/^export PATH=/d' "$BASHRC"
echo "export PATH=$COMBINED_PATH" >> "$BASHRC"

# Add get_idf just in case
grep -qxF "alias get_idf='. \$IDF_PATH/export.sh'" /root/.bashrc || echo "alias get_idf='. \$IDF_PATH/export.sh'" >> /root/.bashrc
if [ "$IDF_ALREADY_INSTALLED" != "true" ]; then
    echo -e "✅ ESP-IDF ${BOLD}v${IDF_VERSION}${NORM} ${GREEN}is ready!${NC}"
fi

echo -e "👍 ${BOLD}All done!${NC}"