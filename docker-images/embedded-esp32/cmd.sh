#!/bin/bash

# MARK: text styling
BOLD=$(tput bold)
NORM=$(tput sgr0)
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# MARK: Environment variables
_toolchainURLx86="${S_TOOLCHAIN_URL_X86}"
_toolchainURLarm="${S_TOOLCHAIN_URL_ARM}"
semVerMajor="${S_VERSION_MAJOR}"
semVerMinor="${S_VERSION_MINOR}"
semVerPatch="${S_VERSION_PATCH}"

# MARK: SWIFT TOOLCHAIN
# automatic detection of arm64 otherwise fallback to x86 even if it's not x86
toolchainURL=$([[ "$(uname -m)" == "aarch64" ]] && echo "${_toolchainURLarm}" || echo "${_toolchainURLx86}")

# official toolchain related variables
toolchainBaseName=$(basename "$toolchainURL")
toolchainName=$(echo "$toolchainBaseName" | sed 's/^swift-//;s/-a-ubuntu20\.04.*$//;s/-ubuntu20\.04.*$//')
toolchainCanonicalName=$(echo "$toolchainBaseName" | sed 's/\(\.tar\.gz\|\.zip\)$//')
# path to all swift toolchains
toolchainsPath="/swift/toolchains"
# path to swift toolchain
toolchainPath="${toolchainsPath}/${toolchainName}"

# download official swift toolchain to volume if needed
if [ ! -f ""${toolchainPath}"/usr/bin/swift" ]; then
    # path to swift toolchain tar ball file
    toolchainTarPath="${toolchainPath}.tar.gz"
    # printing information
    echo -e "${BLUE}Swift toolchain${NC} ${BOLD}${toolchainName}${NORM} ${BLUE}not found on the ${BOLD}swift-toolchains${NC} ${BLUE}volume${NC}"
    
    download_toolchain() {
        retry() {
            read -p "Do you want to retry? (y/n): " choice
            case "$choice" in
                [Yy]* ) echo "Retrying...";;
                [Nn]* ) echo -e "${RED}Please restart the container to try again${NC}"; exit 1;;
                * ) echo -e "Please answer ${YELLOW}y${NC} or ${RED}n${NC}.";;
            esac
        }
        
        while true; do
            echo -e "${YELLOW}Downloading${NC} ${BOLD}${toolchainName}${NORM} ${YELLOW}${toolchainURL}${NC}"
    
            # downloading toolchain archive
            if ! wget "${toolchainURL}" -O "${toolchainTarPath}"; then
                echo -e "${RED}Unable to download${NC} ${BOLD}${toolchainName}${NORM} toolchain"
                retry
            else
                # creating toolchain path if needed
                mkdir -p "${toolchainPath}"
                # extracting toolchain archive
                echo -e "${YELLOW}Extracting${NC} ${BOLD}${toolchainName}${NORM} ${YELLOW}toolchain${NC}"
                if ! pv "${toolchainTarPath}" | tar -C "${toolchainsPath}" -xz; then
                    echo -e "${RED}Unable to extract${NC} ${BOLD}${toolchainTarPath}${NORM} into ${BOLD}${toolchainsPath}${NORM}"
                    retry
                else
                    # moving toolchain from temp folder to permanent
                    if ! mv -f ${toolchainsPath}/${toolchainCanonicalName}/usr ${toolchainPath}/usr; then
                        echo -e "${RED}Unable to move files from the toolchain extract folder into${NC} ${BOLD}${toolchainPath}${NORM}"
                        retry
                    else
                        # all good, cleaning up
                        # removing extract folder
                        if ! rm -rf "${toolchainsPath}/${toolchainCanonicalName}"; then
                            echo -e "${BLUE}Unable to remove files the toolchain extract folder${NC}"
                        fi
                        # removing toolchain archive
                        if ! rm "${toolchainTarPath}"; then
                            echo -e "${BLUE}Unable to remove the toolchain archive file${NC}"
                        fi
                        echo -e "Toolchain ${BOLD}${toolchainName}${NORM} ${GREEN}successfully installed${NC}"
                        break
                    fi
                fi
            fi
        done
    }
    # calling download function
    download_toolchain
else
    echo -e "Toolchain ${BOLD}${toolchainName}${NORM} ${GREEN}is ready${NC}"
fi
# make `swift` available in the current bash session
echo "export PATH=${PATH}:${toolchainPath}/usr/bin" > ~/.bashrc
source ~/.bashrc

# Cleanup SDK symlinks
if [ -d /root/.swiftpm/swift-sdks ]; then
  find /root/.swiftpm/swift-sdks -maxdepth 1 -type l -exec rm -f {} \;
fi

# MARK: SWIFT ARTIFACT
install_artifact() {
    local _artifactURL="$1"

    # artifact related variables
    artifactBaseName=$(basename "$_artifactURL")
    sdkName=$(echo "$artifactBaseName" | sed 's/^swift-//; s/\.artifactbundle\.tar\.gz$//; s/\.artifactbundle\.zip$//')
    artifactName="${sdkName}"
    
    # paths
    artifactSymlinksPath="/root/.swiftpm/swift-sdks"
    artifactsPath="/swift/sdks"
    artifactTarPath="${artifactsPath}/${artifactBaseName}"
    artifactExtractedPath="${artifactsPath}/${artifactBaseName%.tar.gz}"
    artifactExtractedPath="${artifactExtractedPath%.zip}"
    artifactFolder="${artifactBaseName%.tar.gz}"
    artifactFolder="${artifactFolder%.zip}"
    artifactSymlink="${artifactSymlinksPath}/${artifactFolder}"

    mkdir -p "$artifactSymlinksPath"

    retry() {
        read -p "Do you want to retry? (y/n): " choice
        case "$choice" in
            [Yy]* ) echo "Retrying...";;
            [Nn]* ) echo -e "${RED}Please restart the container to try again${NC}"; exit 1;;
            * ) echo -e "Please answer ${YELLOW}y${NC} or ${RED}n${NC}.";;
        esac
    }

    retrying=0

    while true; do
        # only show info once unless retrying
        if [[ $retrying -eq 0 ]]; then
            echo -e "${BLUE}Preparing SDK${NC} ${BOLD}${artifactName}${NORM}"
        fi

        if [[ ! -d "$artifactExtractedPath" || -z "$(ls -A "$artifactExtractedPath" 2>/dev/null)" ]]; then
            if [[ $retrying -eq 0 ]]; then
                echo -e "${YELLOW}Downloading SDK${NC} ${BOLD}${artifactName}${NORM} from ${YELLOW}${_artifactURL}${NC}"
            fi

            if ! wget "${_artifactURL}" -O "${artifactTarPath}"; then
                echo -e "${RED}Unable to download${NC} ${BOLD}${artifactName}${NORM} SDK"
                retrying=1
                retry
            fi

            if [[ $retrying -eq 0 ]]; then
                echo -e "${YELLOW}Extracting SDK${NC} ${BOLD}${artifactName}${NORM}"
            fi

            if [[ "$artifactTarPath" == *.tar.gz ]]; then
                if ! tar -xzf "${artifactTarPath}" -C "${artifactsPath}"; then
                    echo -e "${RED}Unable to extract${NC} ${BOLD}${artifactName}${NORM} SDK (tar.gz)"
                    retrying=1
                    retry
                fi
            elif [[ "$artifactTarPath" == *.zip ]]; then
                if ! unzip -q "${artifactTarPath}" -d "${artifactsPath}"; then
                    echo -e "${RED}Unable to extract${NC} ${BOLD}${artifactName}${NORM} SDK (zip)"
                    retrying=1
                    retry
                fi
            else
                echo -e "${RED}Unknown SDK archive format:${NC} ${BOLD}${artifactBaseName}${NORM}"
                exit 1
            fi

            rm -f "${artifactTarPath}"

            # patch for v6.0.1
            if [[ "$semVerMajor" -eq 6 && "$semVerMinor" -eq 0 && "$semVerPatch" -eq 1 ]]; then
                perl -pi -e 's%canImport\(Bionic%canImport\(Android%' "${toolchainPath}/usr/bin/swift-package"
                perl -pi -e 's%import Bionic%import Android%' "${toolchainPath}/usr/bin/swift-package"
                perl -pi -e 's%TSCBasic, would be%TSCBasic, would %' "${toolchainPath}/usr/bin/swift-package"
            fi
        fi

        # create or refresh symlink
        if [[ $retrying -eq 0 ]]; then
            echo -e "${BLUE}Linking SDK${NC} to ${artifactSymlink}"
        fi
        ln -sfn "${artifactExtractedPath}" "${artifactSymlink}"

        if [[ $retrying -eq 0 ]]; then
            echo -e "SDK ${BOLD}${artifactName}${NORM} ${GREEN}successfully prepared${NC}"
        fi
        break
    done
}

# iterate over artifact urls
for var in $(env | grep '^S_ARTIFACT_' | cut -d= -f1); do
    install_artifact "${!var}"
done

# Check if launchAfterFirstStart.sh exists in the project directory
if [ -f "./launchAfterFirstStart.sh" ]; then
  # Retrieve the first line of the file
  cmd=$(head -n 1 "./launchAfterFirstStart.sh")
  # Execute the command
  bash -c "$cmd"
  # Delete the file after execution
  rm -f "./launchAfterFirstStart.sh"
  echo -c "${GREEN}File launchAfterFirstStart.sh executed and deleted.${NC}"
fi

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
ESP_ROM_ELF=$(basename "$(find ${IDF_TOOLS_PATH}/esp-rom-elfs/ -mindepth 1 -maxdepth 1 -type d | head -n 1)")

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