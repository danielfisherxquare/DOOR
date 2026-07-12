FROM node:20-alpine

WORKDIR /app

# The repository has one canonical npm workspace lockfile at the root.
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/studio-model/package.json packages/studio-model/package.json

RUN apk add --no-cache bash postgresql16-client \
    && npm ci --omit=dev --include=optional --workspace=arcspro-server \
    && node -e "require('@napi-rs/canvas'); console.log('native canvas binding ready')"

COPY server/src/ server/src/
COPY server/scripts/ server/scripts/
COPY server/knexfile.js server/knexfile.js
COPY packages/contracts/ packages/contracts/
COPY packages/studio-model/ packages/studio-model/

WORKDIR /app/server

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/health/live || exit 1

CMD ["node", "src/index.js"]
