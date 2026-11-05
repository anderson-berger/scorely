# Debian (glibc) em vez de Alpine: binários nativos (rolldown, esbuild, biome, turbo)
# batem com o package-lock gerado em hosts glibc — evita o bug npm/cli#4828 com musl.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash git curl ca-certificates unzip less \
  && ARCH="$(uname -m)" \
  && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${ARCH}.zip" -o /tmp/awscli.zip \
  && unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install && rm -rf /tmp/aws /tmp/awscli.zip \
  && rm -rf /var/lib/apt/lists/*

ENV SHELL=/bin/bash

# npm 12: o npm 11 (11.5/11.6) remove os binários de plataforma (esbuild, rolldown...)
# num 2º `npm install` sobre node_modules existente e grava o lockfile sem eles.
RUN npm install -g npm@12.2.1

# Roda como o usuário `node` (uid 1000), não root: o workspace é bind mount do host,
# e arquivos criados como root no container viram root no host (permission denied).
# Os diretórios dos volumes nomeados nascem com o dono definido aqui.
RUN mkdir -p /workspace/node_modules /home/node/.claude \
  && chown -R node:node /workspace /home/node/.claude \
  && echo 'export PS1="\[\033[01;34m\]\w\[\033[00m\]$ "' >> /home/node/.bashrc

USER node
WORKDIR /workspace
CMD ["sleep", "infinity"]
