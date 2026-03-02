#!/bin/bash
set -euo pipefail

# ─── PostgreSQL 恢复脚本 ─────────────────────────────────
# 用法：bash scripts/restore-postgres.sh <备份文件> [目标数据库]
#
# 默认恢复到 door 数据库。
# 建议先恢复到新建数据库验证，再切换。

BACKUP_FILE="${1:-}"
TARGET_DB="${2:-door}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "❌ 请指定备份文件"
  echo "用法: bash scripts/restore-postgres.sh <备份文件> [目标数据库]"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ 备份文件不存在: ${BACKUP_FILE}"
  exit 1
fi

echo "⚠️  即将恢复备份到数据库: ${TARGET_DB}"
echo "   备份文件: ${BACKUP_FILE}"
read -p "   确认继续？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "已取消"
  exit 0
fi

# 检测运行环境
if command -v docker &> /dev/null && docker compose ps postgres 2>/dev/null | grep -q "running"; then
  echo "📦 检测到 Docker Compose 环境…"

  if [ "${TARGET_DB}" != "door" ]; then
    echo "   创建目标数据库 ${TARGET_DB}…"
    docker compose exec -T postgres psql -U door -d postgres -c "CREATE DATABASE ${TARGET_DB};" 2>/dev/null || true
  fi

  echo "   恢复中…"
  docker compose exec -T postgres psql -U door -d "${TARGET_DB}" < "${BACKUP_FILE}"
else
  echo "🖥️  使用本地 psql…"
  PGHOST="${PGHOST:-localhost}"
  PGPORT="${PGPORT:-5432}"
  PGUSER="${PGUSER:-door}"

  if [ "${TARGET_DB}" != "door" ]; then
    echo "   创建目标数据库 ${TARGET_DB}…"
    psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -c "CREATE DATABASE ${TARGET_DB};" 2>/dev/null || true
  fi

  echo "   恢复中…"
  psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${TARGET_DB}" < "${BACKUP_FILE}"
fi

echo "✅ 恢复完成"
