FROM swiftstream/base:latest

# image version, should be increased with any major change
ENV S_IMAGE_VERSION=100

# crawl server port
ENV CS_SERVER_PORT=3080

# do not remove commented out layers, may be needed for the future updates
# install wasm related required dependencies
# RUN apt-get install -y binaryen
# RUN curl https://get.wgit clone --recursive https://github.com/WebAssembly/wabtasmer.io -sSfL | sh
# install wabt related things for wasm-strip (adds 200MB to the image size)
# RUN apt-get install -y python3
# RUN apt-get install -y cmake
# RUN apt-get install -y build-essential
# RUN git clone --recursive https://github.com/WebAssembly/wabt /opt/wabt
# RUN git -C /opt/wabt submodule update --init
# RUN mkdir /opt/wabt/build
# RUN cd /opt/wabt/build && cmake ..
# RUN cd /opt/wabt/build && cmake --build .
# RUN ln -s /opt/wabt/build/wasm-strip /usr/local/bin/wasm-strip
# RUN apt-get purge -y build-essential
# RUN apt-get purge -y cmake
# RUN apt-get purge -y python3
# install nginx to serve the result
RUN apt-get update && apt-get install -y nginx
# install envsubst to put env vars into nginx config
RUN apt-get -y install gettext-base
# install node and all required packages
ENV NVM_DIR="/root/.nvm"
ENV NODE_VERSION="22.10.0"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default \
    && npm install -g webpack-cli@^5.1.4 --quiet --no-progress \
    && npm install -g crawl-server@1.6.1 --quiet --no-progress
# copy required files
COPY wasm-strip /usr/local/bin/
COPY wasm-opt /usr/local/bin/
COPY cmd.sh /usr/local/bin/
COPY nginx/selfsigned.crt /etc/nginx/dev-certs/
COPY nginx/selfsigned.key /etc/nginx/dev-certs/
COPY nginx/default /etc/nginx/sites-available/
COPY nginx/mime.types /etc/nginx/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]