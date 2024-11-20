FROM swiftstream/base:latest

ENV S_IMAGE_VERSION=100

# ngrok
RUN curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | \
  gpg --dearmor -o /etc/apt/keyrings/ngrok.gpg && \
  echo "deb [signed-by=/etc/apt/keyrings/ngrok.gpg] https://ngrok-agent.s3.amazonaws.com buster main" | \
  tee /etc/apt/sources.list.d/ngrok.list && \
  apt update && apt install ngrok
# install nginx to serve the result
RUN apt-get install -y nginx
# install envsubst to put env vars into nginx config
RUN apt-get -y install gettext-base
# copy required files
COPY cmd.sh /usr/local/bin/
COPY nginx/selfsigned.crt /etc/nginx/dev-certs/
COPY nginx/selfsigned.key /etc/nginx/dev-certs/
COPY nginx/default /etc/nginx/sites-available/

RUN ["chmod", "+x", "/usr/local/bin/cmd.sh"]
CMD ["cmd.sh"]