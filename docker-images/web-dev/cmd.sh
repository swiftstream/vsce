#!/bin/bash

source /usr/local/bin/dev-base.sh

# MARK: NGINX
# prepare the config
export DOLLAR="$"
if grep -q "DOLLAR" "/etc/nginx/nginx.conf"; then
    echo "$(envsubst < "/etc/nginx/nginx.conf")" > /etc/nginx/nginx.conf
fi
# Read the environment variable for crawlers list
# Escape dots and double escape backslashes
escaped_crawlers=$(echo "$S_NGINX_CRAWLERS" | sed 's/\./\\\\./g')
# Replace the line with crawlers placeholder
sed -i "s@{{CRAWLERS}}@$escaped_crawlers@g" "/etc/nginx/nginx.conf"
# apply the config
/etc/init.d/nginx restart