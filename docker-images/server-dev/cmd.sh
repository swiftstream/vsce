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
rm -rf /root/.swiftpm/swift-sdks/*/

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

        if [[ ! -d "$artifactExtractedPath" ]]; then
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