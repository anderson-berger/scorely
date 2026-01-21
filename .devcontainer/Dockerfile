FROM node:lts-alpine

WORKDIR /workspace

# Alpine usa 'apk', não 'apt-get'
RUN apk add --no-cache bash git aws-cli

# Configurar bash como shell padrão
ENV SHELL=/bin/bash

# Personalizar o prompt (workspace em azul)
RUN echo 'export PS1="\[\033[01;34m\]\w\[\033[00m\]$ "' >> /root/.bashrc

# Atualizar npm
RUN npm install -g npm@latest

CMD [ "sleep", "infinity" ]