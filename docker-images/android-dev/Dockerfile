FROM swiftstream/base:noble

ENV S_IMAGE_VERSION=100

# Install required tools
RUN apt update && apt install -y openjdk-17-jdk
COPY android-dev/cmd.sh /usr/local/bin/
COPY dev-base.sh /usr/local/bin/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]