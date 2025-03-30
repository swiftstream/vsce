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
artifactURL="${S_ARTIFACT_URL}"

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

# MARK: SWIFT ARTIFACT
install_artifact() {
    local _artifactURL="$1"

    retry() {
        read -p "Do you want to retry? (y/n): " choice
        case "$choice" in
            [Yy]* ) echo "Retrying...";;
            [Nn]* ) echo -e "${RED}Please restart the container to try again${NC}"; exit 1;;
            * ) echo -e "Please answer ${YELLOW}y${NC} or ${RED}n${NC}.";;
        esac
    }

    while true; do
        # artifact related variables
        artifactBaseName=$(basename "$_artifactURL")
        sdkName=$(echo "$artifactBaseName" | sed 's/^swift-//; s/\.artifactbundle\.tar\.gz$//; s/\.artifactbundle\.zip$//')
        artifactName="${sdkName}"
        # path to all swift sdks
        artifactsPath="/root/.swiftpm/swift-sdks"
        artifactTarPath="${artifactsPath}/${artifactBaseName}"

        # check and install artifact if needed
        if swift sdk list | grep -q "${sdkName}"; then
            echo -e "SDK ${BOLD}${artifactName}${NORM} ${GREEN}is ready${NC}"
            break
        else
            echo -e "${BLUE}SDK${NC} ${BOLD}${artifactName}${NORM} ${BLUE}not installed yet${NC}"
            echo -e "${YELLOW}Downloading SDK${NC} ${BOLD}${artifactName}${NORM} ${YELLOW}${_artifactURL}${NC}"
            if ! wget "${_artifactURL}" -O "${artifactTarPath}"; then
                echo -e "${RED}Unable to download${NC} ${BOLD}${artifactName}${NORM} SDK"
                retry
            else
                echo -e "${YELLOW}Installing SDK${NC} ${BOLD}${artifactName}${NORM} ${YELLOW}${_artifactURL}${NC}"
                if ! swift sdk install ${artifactTarPath}; then
                    echo -e "${RED}Unable to install${NC} ${BOLD}${artifactName}${NORM} SDK"
                    retry
                else
                    # removing artifact archive
                    rm "${artifactTarPath}"
                    # patch for v6.0.1
                    if [[ "$semVerMajor" -eq 6 && "$semVerMinor" -eq 0 && "$semVerPatch" -eq 1 ]]; then
                        perl -pi -e 's%canImport\(Bionic%canImport\(Android%' "${toolchainPath}/usr/bin/swift-package"
                        perl -pi -e 's%import Bionic%import Android%' "${toolchainPath}/usr/bin/swift-package"
                        perl -pi -e 's%TSCBasic, would be%TSCBasic, would %' "${toolchainPath}/usr/bin/swift-package"
                    fi
                    echo -e "SDK ${BOLD}${artifactName}${NORM} ${GREEN}successfully installed${NC}"
                    break
                fi
            fi
        fi
    done
}

# checking if artifactURL present
if [[ -n "$artifactURL" ]]; then
    install_artifact "$artifactURL"
fi

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