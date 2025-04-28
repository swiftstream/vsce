FROM swiftstream/web-prod:focal

COPY web-dev/cmd.sh /usr/local/bin/
COPY dev-base.sh /usr/local/bin/
COPY web-dev/wasm-strip /usr/local/bin/
COPY web-dev/wasm-opt /usr/local/bin/
COPY web-dev/selfsigned.crt /etc/nginx/dev-certs/
COPY web-dev/selfsigned.key /etc/nginx/dev-certs/
COPY web-dev/nginx.conf /etc/nginx/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]