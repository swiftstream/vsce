#!/bin/bash

# MARK: NGINX
# prepare the config
export DOLLAR="$"
if grep -q "DOLLAR" "$NGINX_CONFIG"; then
    echo "$(envsubst < "$NGINX_CONFIG")" > "$NGINX_CONFIG"
fi
# Read the environment variable for crawlers list
# Escape dots and double escape backslashes
escaped_crawlers=$(echo "$S_NGINX_CRAWLERS" | sed 's/\./\\\\./g')
# Replace the line with crawlers placeholder
sed -i "s@{{CRAWLERS}}@$escaped_crawlers@g" "$NGINX_CONFIG"
# apply the config
/etc/init.d/nginx restart

# MARK: CrawlServer
# load NVM
source "$NVM_DIR/nvm.sh"
# run (keeps container running)
$NVM_DIR/versions/node/v$NODE_VERSION/bin/crawlserver /usr/share/nginx/html/app.wasm -p $CS_SERVER_PORT -g