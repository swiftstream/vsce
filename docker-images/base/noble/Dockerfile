FROM ubuntu:noble

# fixes hang on interactive dialogs
ARG DEBIAN_FRONTEND=noninteractive

# it is very important to match it with the image platform
# e.g. for `ubuntu:noble` it should be `ubuntu24.04`
ENV S_TOOLCHAIN_PLATFORM="ubuntu24.04"

# Image version, should be increased with any major change
ENV S_IMAGE_VERSION=100

# update packages
RUN apt update && apt upgrade -y \
# install required dependencies according to swift.org
    && apt install -y binutils git gnupg2 \
    libc6-dev libcurl4-openssl-dev libedit2 \
    libgcc-13-dev libncurses-dev libpython3-dev \
    libsqlite3-0 libstdc++-13-dev libxml2-dev \
    libz3-dev pkg-config tzdata uuid-dev \
    zlib1g-dev curl \
# install cmd.sh related required dependencies
    unzip wget pv