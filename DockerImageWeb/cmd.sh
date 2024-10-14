#!/bin/bash

# MARK: text styling
BOLD=$(tput bold)
NORM=$(tput sgr0)
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# MARK: SWIFT TOOLCHAIN
# automatic detection of arm64 otherwise fallback to x86 even if it's not x86
toolchainArch=$([[ "$(uname -m)" == "aarch64" ]] && echo "aarch64" || echo "")

# official toolchain related variables
toolchainName="${S_TOOLCHAIN}"
toolchainURL="https://download.swift.org/${toolchainName,,}/ubuntu2004-${toolchainArch}/${toolchainName}/${toolchainName}-ubuntu20.04-${toolchainArch}.tar.gz"
tagRightPart=$(echo "${toolchainName}" | sed 's/^swift-//;')
# path to all swift toolchains
toolchainsPath="/swift/toolchains"
# path to swift toolchain
toolchainPath="${toolchainsPath}/${tagRightPart}"

# download official swift toolchain to volume if needed
if [ ! -f ""${toolchainPath}"/usr/bin/swift" ]; then
    # path to swift toolchain tar ball file
    toolchainTarPath="${toolchainPath}.tar.gz"
    # printing information
    echo -e "${BLUE}Swift toolchain${NC} ${BOLD}${toolchainName}${NORM} ${BLUE}not found on the ${BOLD}swift-toolchains${NC} ${BLUE}volume${NC}"
    echo -e "${YELLOW}Downloading${NC} ${BOLD}${toolchainName}${NORM} ${YELLOW}${toolchainURL}${NC}"
    # downloading toolchain archive
    wget "${toolchainURL}" -O "${toolchainTarPath}"
    # creating toolchain path if needed
    mkdir -p "${toolchainPath}"
    # extracting toolchain archive
    echo -e "${YELLOW}Extracting${NC} ${BOLD}${toolchainName}${NORM} ${YELLOW}toolchain${NC}"
    pv "${toolchainTarPath}" | tar -C "${toolchainsPath}" -xz
    # moving toolchain from temp folder to permanent
    mv -f ${toolchainsPath}/${toolchainName}-ubuntu20.04-${toolchainArch}/usr ${toolchainPath}/usr
    # removing extract folder
    rm -rf ${toolchainsPath}/${toolchainName}-ubuntu20.04-${toolchainArch}
    # removing toolchain archive
    rm "${toolchainTarPath}"
    echo -e "Toolchain ${BOLD}${toolchainName}${NORM} ${GREEN}successfully installed${NC}"
else
    echo -e "Toolchain ${BOLD}${toolchainName}${NORM} ${GREEN}is ready${NC}"
fi
# make `swift` available in the current bash session
echo "export PATH=${PATH}:${toolchainPath}/usr/bin" > ~/.bashrc
source ~/.bashrc

# MARK: SWIFT ARTIFACT
# artifact related variables
artifactArch=$([[ "$(uname -m)" == "aarch64" ]] && echo "aarch64" || echo "x86_64")
artifactName="${S_ARTIFACT}"
sdkName="${artifactName}-wasm"
artifactShortVersion=$(echo "${artifactName}" | cut -d'-' -f1)
artifactURL="https://github.com/swiftwasm/swift/releases/download/swift-wasm-${artifactName}/swift-wasm-${artifactName}-ubuntu20.04_${artifactArch}.artifactbundle.zip"
# path to all swift sdks
artifactsPath="/root/.swiftpm/swift-sdks"
artifactTarPath="${artifactsPath}/${tagRightPart}-android-${androidVersion}.tar.gz"

# check and install artifact if needed
if swift sdk list | grep -q "${sdkName}"; then
    echo -e "SDK ${BOLD}android-${androidVersion}${NORM} ${GREEN}is ready${NC}"
else
    echo -e "${BLUE}SDK${NC} ${BOLD}android-${androidVersion}${NORM} ${BLUE}not installed yet${NC}"
    echo -e "${YELLOW}Downloading SDK${NC} ${BOLD}android-${androidVersion}${NORM} ${YELLOW}${artifactURL}${NC}"
    if ! wget "${artifactURL}" -O "${artifactTarPath}"; then
        echo -e "${RED}Unable to download${NC} ${BOLD}android-${androidVersion}${NORM} SDK"
        echo -e "${RED}Please restart the container to try again${NC}"
    else
        echo -e "${YELLOW}Installing SDK${NC} ${BOLD}android-${androidVersion}${NORM} ${YELLOW}${artifactURL}${NC}"
        if ! swift sdk install ${artifactTarPath}; then
            echo -e "${RED}Unable to install${NC} ${BOLD}android-${androidVersion}${NORM} SDK"
            echo -e "${RED}Please restart the container to try again${NC}"
        else
            # removing artifact archive
            rm "${artifactTarPath}"
            echo -e "SDK ${BOLD}android-${androidVersion}${NORM} ${GREEN}successfully installed${NC}"
        fi
    fi
fi

# MARK: NGINX
# certs path if needed
nginxCertsPath="/etc/nginx/certs"
# creating certs path if needed
mkdir -p "${nginxCertsPath}"
# creating certs
openssl req -x509 -days 3650 -keyout "${nginxCertsPath}/selfsigned.key" -out "${nginxCertsPath}/selfsigned.crt" -newkey rsa:2048 -nodes -sha256 -subj /CN=0.0.0.0 -extensions EXT -config /etc/nginx/openssl.cnf
# prepare the config
export DOLLAR="$"
if grep -q "DOLLAR" "/etc/nginx/sites-available/default"; then
    echo "$(envsubst < "/etc/nginx/sites-available/default")" > /etc/nginx/sites-available/default
fi
# apply config
/etc/init.d/nginx restart