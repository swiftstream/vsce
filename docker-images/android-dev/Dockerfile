FROM swiftstream/base:latest

ENV S_IMAGE_VERSION=100

# copy required files
COPY cmd.sh /usr/local/bin/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]