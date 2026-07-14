# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    STATIC_DIR=/app/dist \
    DBML_SAVES_DIR=/data/saves \
    DBML_SQLITE_ROOT=/data/saves \
    MAX_BODY_BYTES=33554432

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && mkdir -p /data/saves \
  && chown -R node:node /data /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node scripts/production-server.mjs ./scripts/production-server.mjs

USER node
EXPOSE 8080
VOLUME ["/data/saves"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "scripts/production-server.mjs"]
