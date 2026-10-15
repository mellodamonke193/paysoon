FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/paysoon.db

WORKDIR /app
# No dependencies to install: the app only uses Node's standard library.
COPY package.json ./
COPY src ./src
COPY public ./public

RUN mkdir -p /data && chown -R node:node /data
USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
