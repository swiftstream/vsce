#!/bin/bash

source /usr/local/bin/dev-base.sh

# MARK: Gradle setup
GRADLE_VERSION="${S_GRADLE_VERSION:-8.14}"
GRADLE_DIR="/opt/android/gradle"
GRADLE_HOME="${GRADLE_DIR}/${GRADLE_VERSION}"
GRADLE_DIST="gradle-${GRADLE_VERSION}-bin.zip"
GRADLE_URL="https://services.gradle.org/distributions/${GRADLE_DIST}"
GRADLE_BIN="${GRADLE_HOME}/bin/gradle"

echo -e "${BLUE}${BOLD}➤ Setting up Gradle ${GRADLE_VERSION}${NC}"

mkdir -p "${GRADLE_DIR}"

# Download and extract Gradle if not already installed or if binary is missing
if [ ! -x "$GRADLE_BIN" ]; then
    echo -e "${YELLOW}→ Gradle binary not found. Installing...${NC}"
    rm -rf "${GRADLE_HOME}"
    wget -q "$GRADLE_URL" -O "/tmp/${GRADLE_DIST}"
    unzip -q "/tmp/${GRADLE_DIST}" -d /tmp

    # Move extracted folder to desired versioned path
    mv "/tmp/gradle-${GRADLE_VERSION}" "${GRADLE_HOME}"
    rm "/tmp/${GRADLE_DIST}"

    echo -e "${GREEN}✓ Gradle ${GRADLE_VERSION} installed at ${GRADLE_HOME}${NC}"
else
    echo -e "${GREEN}✓ Gradle ${GRADLE_VERSION} already present at ${GRADLE_HOME}${NC}"
fi

# Export for current shell
export GRADLE_HOME="${GRADLE_HOME}"
export PATH="$GRADLE_HOME/bin:$PATH"

# Add to .bashrc if not already there
if ! grep -q "GRADLE_HOME=${GRADLE_HOME}" ~/.bashrc 2>/dev/null; then
    echo "export GRADLE_HOME=${GRADLE_HOME}" >> ~/.bashrc
    echo "export PATH=\$GRADLE_HOME/bin:\$PATH" >> ~/.bashrc
    echo -e "${BLUE}→ Environment variables added to .bashrc${NC}"
fi

# MARK: Android NDK setup
NDK_VERSION="${S_NDK_VERSION:-r27c}"
NDK_BASE_DIR="/opt/android/ndk"
NDK_DIR="${NDK_BASE_DIR}/${NDK_VERSION}"
NDK_DIST="android-ndk-${NDK_VERSION}-linux.zip"
NDK_URL="https://dl.google.com/android/repository/${NDK_DIST}"
NDK_TMP_EXTRACT="/tmp/android-ndk-${NDK_VERSION}"
NDK_TARGET_BIN="${NDK_DIR}/ndk-build"

echo -e "${BLUE}${BOLD}➤ Setting up Android NDK ${NDK_VERSION}${NC}"

# Show license disclaimer
echo -e "${YELLOW}→ By using NDK, you agree to the terms of the Android Software Development Kit License Agreement:${NC}"
echo -e "${BLUE}https://developer.android.com/studio/terms.html${NC}"

if [ ! -f "${NDK_TARGET_BIN}" ]; then
    echo -e "${YELLOW}→ Downloading Android NDK...${NC}"
    rm -rf "${NDK_DIR}"
    mkdir -p "${NDK_BASE_DIR}"
    wget -q "${NDK_URL}" -O "/tmp/${NDK_DIST}"
    echo -e "${YELLOW}→ Extracting Android NDK...${NC}"
    unzip -q "/tmp/${NDK_DIST}" -d "/tmp"
    
    # Move entire extracted folder into versioned location
    mv "${NDK_TMP_EXTRACT}" "${NDK_DIR}"
    rm -f "/tmp/${NDK_DIST}"

    echo -e "${GREEN}✓ Android NDK ${NDK_VERSION} installed at ${NDK_DIR}${NC}"
else
    echo -e "${GREEN}✓ Android NDK ${NDK_VERSION} already present at ${NDK_DIR}${NC}"
fi

# Export for current shell
export ANDROID_NDK_HOME="${NDK_DIR}"
export PATH="${ANDROID_NDK_HOME}:$PATH"

# Add to .bashrc if not already there
if ! grep -q "ANDROID_NDK_HOME=${NDK_DIR}" ~/.bashrc 2>/dev/null; then
    echo "export ANDROID_NDK_HOME=${NDK_DIR}" >> ~/.bashrc
    echo "export PATH=\$ANDROID_NDK_HOME:\$PATH" >> ~/.bashrc
    echo -e "${BLUE}→ ANDROID_NDK_HOME added to .bashrc${NC}"
fi
