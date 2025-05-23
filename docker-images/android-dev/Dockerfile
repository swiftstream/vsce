FROM swiftstream/base:noble

ENV S_IMAGE_VERSION=100

# Install required tools
RUN apt update && apt install -y openjdk-17-jdk

# Enable amd64 support to run x86_64 binaries (e.g. aapt2) on arm64
RUN if [ "$(dpkg --print-architecture)" = "arm64" ]; then \
    # Remove broken modern source format
    rm -f /etc/apt/sources.list.d/ubuntu.sources && \
    # Add amd64 architecture
    dpkg --add-architecture amd64 && \
    # Restrict current sources to arm64 only
    sed -i 's|^deb |deb [arch=arm64] |g' /etc/apt/sources.list && \
    # Add archive.ubuntu.com sources for amd64
    echo "deb [arch=amd64] http://archive.ubuntu.com/ubuntu noble main restricted universe multiverse" > /etc/apt/sources.list.d/amd64.list && \
    echo "deb [arch=amd64] http://archive.ubuntu.com/ubuntu noble-updates main restricted universe multiverse" >> /etc/apt/sources.list.d/amd64.list && \
    echo "deb [arch=amd64] http://archive.ubuntu.com/ubuntu noble-security main restricted universe multiverse" >> /etc/apt/sources.list.d/amd64.list && \
    echo "deb [arch=amd64] http://archive.ubuntu.com/ubuntu noble-backports main restricted universe multiverse" >> /etc/apt/sources.list.d/amd64.list && \
    apt-get update && \
    apt-get install -y libc6:amd64 libstdc++6:amd64 zlib1g:amd64 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*; \
fi

# Copy scripts
COPY android-dev/cmd.sh /usr/local/bin/
COPY dev-base.sh /usr/local/bin/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]