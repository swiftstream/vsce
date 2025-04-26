FROM ubuntu:focal

# fixes hang on interactive dialogs
ARG DEBIAN_FRONTEND=noninteractive

# it is very important to match it with the image platform
# e.g. for `ubuntu:focal` it should be `ubuntu20.04`
ENV S_TOOLCHAIN_PLATFORM="ubuntu20.04"

# Image version, should be increased with any major change
ENV S_IMAGE_VERSION=100

# update packages
RUN apt-get update && apt-get upgrade -y \
# install required dependencies according to swift.org
    && apt-get install -y binutils git gnupg2 \
    libc6-dev libcurl4 libedit2 libgcc-9-dev \
    libpython2.7 libpython3.8 libsqlite3-0 \
    libstdc++-9-dev libxml2 libz3-dev pkg-config \
    tzdata uuid-dev zlib1g-dev curl \
# install cmd.sh related required dependencies
    unzip wget pv