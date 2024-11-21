#!/bin/bash

# MARK: NGINX
# prepare the config
export DOLLAR="$"
if grep -q "DOLLAR" "/etc/nginx/sites-available/default"; then
    echo "$(envsubst < "/etc/nginx/sites-available/default")" > /etc/nginx/sites-available/default
fi
# Read the environment variable for crawlers list
# Escape dots and double escape backslashes
escaped_crawlers=$(echo "$S_NGINX_CRAWLERS" | sed 's/\./\\\\./g')
# Replace the line with crawlers placeholder
sed -i "s@{{CRAWLERS}}@$escaped_crawlers@g" "/etc/nginx/sites-available/default"
# apply the config
/etc/init.d/nginx restart