FROM swiftstream/base:noble

ENV S_IMAGE_VERSION=100

# install raspberry required packages
RUN apt update && apt install -y libusb-1.0-0-dev make python3 python3-pip python3-venv \
                                build-essential gcc-arm-none-eabi ninja-build \
                                libnewlib-arm-none-eabi libstdc++-arm-none-eabi-newlib

# Add fake `libtool` wrapper for Swift build compatibility
RUN echo '#!/bin/bash\nexec ar "$@"' > /usr/local/bin/libtool && \
    chmod +x /usr/local/bin/libtool

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
COPY embedded-raspberry/cmd.sh /usr/local/bin/
COPY dev-base.sh /usr/local/bin/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]