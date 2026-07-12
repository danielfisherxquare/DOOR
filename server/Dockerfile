# ── Build stage ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ src/
COPY scripts/ scripts/
COPY knexfile.js ./

# ── Runtime stage ────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache bash postgresql-client
COPY --from=builder /app /app
ENV NODE_ENV=production

# 创建非 root 用户运行应用
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs
RUN mkdir -p /app/storage && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health/ready || exit 1

CMD ["node", "src/index.js"]
