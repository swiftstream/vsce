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
