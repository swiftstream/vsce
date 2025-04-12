#!/bin/bash

# MARK: NGINX
# prepare the config
export DOLLAR="$"
if grep -q "DOLLAR" "$NGINX_CONFIG"; then
    echo "$(envsubst < "$NGINX_CONFIG")" > "$NGINX_CONFIG"
fi
# apply the config
/etc/init.d/nginx restart

# MARK: Swift
if [ -f /swift/App ]; then
    # make it executable
    chmod +x /swift/App
    # start the server
    /swift/App
fi