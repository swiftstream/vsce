FROM swiftstream/base:noble

ENV S_IMAGE_VERSION=100

# install esp-idf required packages
RUN apt-get update && apt-get install -y \
flex bison gperf python3 python3-pip python3-venv ninja-build ccache \
libffi-dev libssl-dev dfu-util libusb-1.0-0

# Install architecture-specific CMake 3.31.7
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        CMAKE_URL="https://github.com/Kitware/CMake/releases/download/v3.31.7/cmake-3.31.7-linux-x86_64.sh"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        CMAKE_URL="https://github.com/Kitware/CMake/releases/download/v3.31.7/cmake-3.31.7-linux-aarch64.sh"; \
    else \
        echo "❌ Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    wget "$CMAKE_URL" -O /tmp/cmake-install.sh && \
    chmod +x /tmp/cmake-install.sh && \
    /tmp/cmake-install.sh --skip-license --prefix=/usr/local && \
    rm /tmp/cmake-install.sh

# copy required files
COPY cmd.sh /usr/local/bin/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]