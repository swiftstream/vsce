# ---- Stage 1: Build Brotli Modules for Nginx ----
FROM ubuntu:focal AS builder

# Install dependencies required to build Nginx and Brotli
RUN apt update \
    && apt upgrade -y \
    && apt install -y libpcre3 libpcre3-dev zlib1g zlib1g-dev openssl libssl-dev wget git gcc make libbrotli-dev

WORKDIR /app

ENV NGINX_VERSION="1.18.0"

# Download and extract Nginx source code
RUN wget https://nginx.org/download/nginx-$NGINX_VERSION.tar.gz && tar -zxf nginx-$NGINX_VERSION.tar.gz

# Clone Brotli module
RUN git clone --recurse-submodules -j8 https://github.com/google/ngx_brotli

# Compile Nginx with Brotli module
RUN cd nginx-$NGINX_VERSION \
    && ./configure --with-compat --add-dynamic-module=../ngx_brotli \
    && make modules

# ---- Stage 2: Final Ubuntu 20.04 (focal) Image ----
FROM swiftstream/base:latest

# Install Nginx and Brotli
RUN apt update && apt install -y nginx brotli libbrotli1

# Copy compiled Brotli modules from builder stage
COPY --from=builder /app/nginx-1.18.0/objs/ngx_http_brotli_static_module.so /usr/lib/nginx/modules/
COPY --from=builder /app/nginx-1.18.0/objs/ngx_http_brotli_filter_module.so /usr/lib/nginx/modules/

ENV S_NGINX_CRAWLERS="ahrefsbot|applebot|baiduspider|bingbot|developers.google.com|discordbot|duckduckbot|exabot|facebookexternalhit|gigabot|googlebot|ia_archiver|linkedinbot|mj12bot|pinterestbot|rogerbot|semrushbot|seznambot|skypeuripreview|slackbot|slurp|sogou|telegrambot|twitterbot|whatsapp|yahoo|yandex|yeti|yodaobot"
ENV NGINX_CONFIG="/etc/nginx/nginx.conf"

# Install envsubst to put env vars into nginx config
RUN apt-get -y install gettext-base

# Install node and all required packages
ENV NVM_DIR="/root/.nvm"
ENV NVM_VERSION="0.40.1"
ENV NODE_VERSION="22.10.0"
ENV WEBPACK_VERSION="^5.1.4"
ENV CRAWLER_VERSION="1.7.3"
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v$NVM_VERSION/install.sh | bash \
    && . $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default \
    && npm install -g webpack-cli@$WEBPACK_VERSION --quiet --no-progress \
    && npm install -g crawl-server@$CRAWLER_VERSION --quiet --no-progress

# Copy required files
COPY cmd.sh /usr/local/bin/
COPY nginx.conf /etc/nginx/

# Image version, should be increased with any major change
ENV S_IMAGE_VERSION=100

# Crawl server port
ENV CS_SERVER_PORT=3080

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]