FROM swiftstream/web-prod:focal

COPY web-dev/cmd.sh /usr/local/bin/
COPY dev-base.sh /usr/local/bin/
COPY wasm-strip /usr/local/bin/
COPY wasm-opt /usr/local/bin/
COPY selfsigned.crt /etc/nginx/dev-certs/
COPY selfsigned.key /etc/nginx/dev-certs/
COPY nginx.conf /etc/nginx/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]