FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache bash postgresql-client \
    && npm ci --production
COPY src/ src/
COPY scripts/ scripts/
COPY knexfile.js ./
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/health/live || exit 1
CMD ["node", "src/index.js"]
