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

ENV NGINX_CONFIG="/etc/nginx/nginx.conf"

# Copy required files
COPY cmd.sh /usr/local/bin/
COPY nginx.conf /etc/nginx/

# Image version, should be increased with any major change
ENV S_IMAGE_VERSION=100

# Server port
ENV SERVER_PORT=8080

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]