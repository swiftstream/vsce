FROM swiftstream/base:latest

ENV S_IMAGE_VERSION=100

# install nginx to serve the result
RUN apt-get update && apt-get install -y nginx
# install envsubst to put env vars into nginx config
RUN apt-get update && apt-get install -y gettext-base
# copy required files
COPY cmd.sh /usr/local/bin/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]