#!/bin/bash
set -euo pipefail

# ─── PostgreSQL 备份脚本 ─────────────────────────────────
# 用法：bash scripts/backup-postgres.sh [输出目录]
#
# 支持两种运行模式：
#   1. 从 Docker Compose 外部运行（通过 localhost:5432）
#   2. 从 Docker Compose 内部运行（通过 postgres:5432）

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/door_backup_${TIMESTAMP}.sql"

# 确保输出目录存在
mkdir -p "${OUTPUT_DIR}"

# 检测运行环境
if command -v docker &> /dev/null && docker compose ps postgres 2>/dev/null | grep -q "running"; then
  echo "📦 检测到 Docker Compose 环境，使用 docker compose exec…"
  docker compose exec -T postgres pg_dump -U door -d door > "${BACKUP_FILE}"
else
  echo "🖥️  使用本地 pg_dump…"
  PGHOST="${PGHOST:-localhost}"
  PGPORT="${PGPORT:-5432}"
  PGUSER="${PGUSER:-door}"
  PGDATABASE="${PGDATABASE:-door}"
  pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" > "${BACKUP_FILE}"
fi

echo "✅ 备份完成: ${BACKUP_FILE}"
echo "📏 文件大小: $(du -h "${BACKUP_FILE}" | cut -f1)"
