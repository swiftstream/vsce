FROM swiftstream/base:latest

ENV S_IMAGE_VERSION=100

# install nginx to serve the result
RUN apt-get install -y nginx
# install envsubst to put env vars into nginx config
RUN apt-get -y install gettext-base
# copy required files
COPY cmd.sh /usr/local/bin/
COPY nginx/default /etc/nginx/sites-available/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]