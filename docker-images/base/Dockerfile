FROM ubuntu:focal

# fixes hang on interactive dialogs
ARG DEBIAN_FRONTEND=noninteractive

# it is very important to match it with the image platform
# e.g. for `ubuntu:focal` it should be `ubuntu20.04`
ENV S_TOOLCHAIN_PLATFORM="ubuntu20.04"

# Image version, should be increased with any major change
ENV S_IMAGE_VERSION=100

# update packages
RUN apt-get update && apt-get upgrade -y

# install required dependencies according to swift.org
RUN apt-get install -y binutils
RUN apt-get install -y git
RUN apt-get install -y gnupg2
RUN apt-get install -y libc6-dev
RUN apt-get install -y libcurl4
RUN apt-get install -y libedit2
RUN apt-get install -y libgcc-9-dev
RUN apt-get install -y libpython2.7
RUN apt-get install -y libpython3.8
RUN apt-get install -y libsqlite3-0
RUN apt-get install -y libstdc++-9-dev
RUN apt-get install -y libxml2
RUN apt-get install -y libz3-dev
RUN apt-get install -y pkg-config
RUN apt-get install -y tzdata
RUN apt-get install -y uuid-dev
RUN apt-get install -y zlib1g-dev
RUN apt-get install -y curl
# important for: swift sdk install
RUN apt-get install -y unzip
# install cmd.sh related required dependencies
RUN apt-get install -y wget
RUN apt-get install -y pv