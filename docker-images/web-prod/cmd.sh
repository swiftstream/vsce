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

# MARK: CrawlServer
# load NVM
export NVM_DIR="/root/.nvm"
source "$NVM_DIR/nvm.sh"
# run (keeps container running)
/root/.nvm/versions/node/v22.10.0/bin/crawlserver /usr/share/nginx/html/app.wasm -p 3080 -g