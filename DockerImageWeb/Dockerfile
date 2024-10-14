FROM swiftstream/base:latest

ENV S_IMAGE_VERSION=100

# install wasm related required dependencies
RUN apt-get install -y binaryen
RUN curl https://get.wasmer.io -sSfL | sh
# install nginx to serve the result
RUN apt-get install -y nginx
# install envsubst to put env vars into nginx config
RUN apt-get -y install gettext-base
# install node and all required packages
ENV NVM_DIR="/root/.nvm"
ENV NODE_VERSION="20.17.0"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default \
    && npm install -g webpack-cli@^5.1.4 --quiet --no-progress
# copy required files
COPY cmd.sh /usr/local/bin/
COPY nginx/default /etc/nginx/sites-available/
COPY nginx/mime.types /etc/nginx/
COPY nginx/openssl.cnf /etc/nginx/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]