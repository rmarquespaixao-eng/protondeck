# syntax=docker/dockerfile:1
# ProtonDeck — imagem self-hosted pra rodar o painel

# ───── Stage 1: build ─────
FROM node:22-alpine AS builder
WORKDIR /app

# Build deps pra better-sqlite3 (compila .node binding)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# tsc nao copia .ejs e static — copiamos manualmente pra dist/
RUN cp -r src/adapters/primary/http/views  dist/adapters/primary/http/ && \
    cp -r src/adapters/primary/http/public dist/adapters/primary/http/

# ───── Stage 2: runtime ─────
FROM node:22-alpine AS runtime
WORKDIR /app

# tini = init PID 1 pra sinais corretos; pciutils habilita o detect de GPU
RUN apk add --no-cache tini pciutils

# Instala deps de produção. Precisa de build tools temporariamente pra
# recompilar better-sqlite3 (a binding compilada no builder so funciona
# se o sistema base for identico — multi-stage com mesma base resolve,
# mas mantemos o rebuild aqui pra robustez em arquiteturas diferentes).
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci --omit=dev \
 && apk del .build-deps \
 && npm cache clean --force \
 && rm -rf /tmp/*

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3030
ENV PROTONDECK_DB=/app/data/panel.db
ENV PROTONDECK_COMMUNITY_CACHE=/app/data/community-cache

VOLUME ["/app/data"]
EXPOSE 3030

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/main.js"]
