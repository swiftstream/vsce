FROM swiftstream/base:noble

ENV S_IMAGE_VERSION=100

RUN apt-get update && apt-get upgrade -y

RUN wget https://apt.kitware.com/kitware-archive.sh && bash kitware-archive.sh

# install zephyr required packages
RUN apt-get update && apt install --no-install-recommends -y git ninja-build gperf
RUN apt-get update && apt install -y ccache dfu-util device-tree-compiler
RUN apt-get update && apt install -y python3 python3-dev python3-pip python3-venv python3-setuptools python3-tk python3-wheel
RUN apt-get update && apt install -y xz-utils file make gcc libsdl2-dev libmagic1
# g++-multilib : Unable to locate packages gcc-multilib, g++-multilib
RUN apt-get update && apt install -y libusb-1.0-0 udev
RUN pip3 install --break-system-packages west

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
COPY embedded-nrf/cmd.sh /usr/local/bin/
COPY dev-base.sh /usr/local/bin/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]