FROM swiftstream/web-prod:latest

COPY wasm-strip /usr/local/bin/
COPY wasm-opt /usr/local/bin/
COPY cmd.sh /usr/local/bin/
COPY selfsigned.crt /etc/nginx/dev-certs/
COPY selfsigned.key /etc/nginx/dev-certs/
COPY nginx.conf /etc/nginx/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]