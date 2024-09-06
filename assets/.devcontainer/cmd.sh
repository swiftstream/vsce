#!/bin/bash

# store toolchain name locally
toolchainName="${S_TOOLCHAIN}"
# automatic detection of arm64 otherwise fallback to x86 even if it's not x86
toolchainArch=$([[ "$(uname -m)" == "aarch64" ]] && echo aarch64 || echo x86_64)
# the name of the swift toolchain archive name
# which will be downloaded and extracted down below
packageName="${toolchainName}-${S_TOOLCHAIN_PLATFORM}_${toolchainArch}"
toolchainsPath="/swift/toolchains"
# path to swift toolchain
toolchainPath="${toolchainsPath}/${toolchainName}"

# certs path if needed
nginxCertsPath="/etc/nginx/certs"

# creating certs path if needed
mkdir -p "${nginxCertsPath}"

# creating certs
openssl req -x509 -days 3650 -keyout "${nginxCertsPath}/selfsigned.key" -out "${nginxCertsPath}/selfsigned.crt" -newkey rsa:2048 -nodes -sha256 -subj /CN=0.0.0.0 -extensions EXT -config /etc/nginx/openssl.cnf
# download swift toolchain to volume if needed
if [ ! -f ""${toolchainPath}"/usr/bin/swift" ]; then
    # path to swift toolchain tar ball file
    toolchainTarPath="${toolchainPath}.tar.gz"
    # path where to extract swift toolchain tar ball file
    toolchainWrongPath="${toolchainPath}/${toolchainName}"
    toolchainTarExtractPath="${toolchainPath}"
    # printing information
    echo "Swift toolchain ${toolchainName} not found on swift-wasm-toolchains volume"
    echo "Downloading ${toolchainName} https://github.com/swiftwasm/swift/releases/download/${toolchainName}/${packageName}.tar.gz"
    # downloading toolchain archive
    wget "https://github.com/swiftwasm/swift/releases/download/${toolchainName}/${packageName}.tar.gz" -O "${toolchainTarPath}"
    # creating toolchain path if needed
    mkdir -p "${toolchainPath}"
    # extracting toolchain archive
    echo "Extracting ${toolchainName} toolchain"
    pv "${toolchainTarPath}" | tar -C "${toolchainTarExtractPath}" -xz
    # moving toolchain from temp folder to permanent
    echo "mv -f ${toolchainTarExtractPath}/usr ${toolchainPath}/usr"
    mv -f "${toolchainWrongPath}/usr" "${toolchainPath}/usr"
    # removing toolchain temp folder
    rm -rf "${toolchainWrongPath}"
    # removing toolchain archive
    rm "${toolchainTarPath}"
    echo "Toolchain ${toolchainName} successfully installed"
else
    echo "Toolchain ${toolchainName} already installed"
fi
echo "export PATH=${PATH}:${toolchainPath}/usr/bin" > ~/.bashrc
export DOLLAR="$"
if grep -q "DOLLAR" "/etc/nginx/sites-available/default"; then
    echo "$(envsubst < "/etc/nginx/sites-available/default")" > /etc/nginx/sites-available/default
fi
/etc/init.d/nginx restart