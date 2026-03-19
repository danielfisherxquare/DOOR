#!/bin/bash
set -euo pipefail

TRIGGER="manual"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --trigger)
      TRIGGER="${2:-manual}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-10}"
DB_OPS_LOCK_DIR="${DB_OPS_LOCK_DIR:-/tmp/door-db-ops.lock}"
DATABASE_URL="${DATABASE_URL:-postgres://door:door_dev@postgres:5432/door}"
FILE_PREFIX="${BACKUP_FILE_PREFIX:-door_backup}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILENAME="${FILE_PREFIX}_${TIMESTAMP}.sql.gz"
TARGET_PATH="${BACKUP_DIR}/${FILENAME}"
TMP_PATH="${TARGET_PATH}.tmp"
META_PATH="${BACKUP_DIR}/${FILE_PREFIX}_${TIMESTAMP}.meta.json"

checksum_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    echo ""
  fi
}

cleanup() {
  rm -f "${TMP_PATH}"
  rmdir "${DB_OPS_LOCK_DIR}" 2>/dev/null || true
}

mkdir -p "${BACKUP_DIR}"

if ! mkdir "${DB_OPS_LOCK_DIR}" 2>/dev/null; then
  echo "Another backup/restore operation is already running" >&2
  exit 1
fi

trap cleanup EXIT

pg_dump "${DATABASE_URL}" | gzip -c > "${TMP_PATH}"

if [[ ! -s "${TMP_PATH}" ]]; then
  echo "Backup file is empty" >&2
  exit 1
fi

mv "${TMP_PATH}" "${TARGET_PATH}"

# ── 备份 .env 文件 ──────────────────────────────────────────────
ENV_SRC="${ENV_FILE:-$(cd "$(dirname "$0")/.." && pwd)/.env}"
ENV_FILENAME="${FILE_PREFIX}_${TIMESTAMP}.env"
ENV_TARGET="${BACKUP_DIR}/${ENV_FILENAME}"
ENV_SIZE=0
if [[ -f "${ENV_SRC}" ]]; then
  cp "${ENV_SRC}" "${ENV_TARGET}"
  chmod 600 "${ENV_TARGET}"
  ENV_SIZE="$(wc -c < "${ENV_TARGET}" | tr -d ' ')"
fi

SIZE_BYTES="$(wc -c < "${TARGET_PATH}" | tr -d ' ')"
SHA256="$(checksum_file "${TARGET_PATH}")"
CREATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "${META_PATH}" <<EOF
{
  "filename": "${FILENAME}",
  "createdAt": "${CREATED_AT}",
  "sizeBytes": ${SIZE_BYTES},
  "database": "door",
  "format": "sql.gz",
  "trigger": "${TRIGGER}",
  "status": "success",
  "sha256": "${SHA256}"$(if [[ ${ENV_SIZE} -gt 0 ]]; then echo ",
  \"envFile\": \"${ENV_FILENAME}\",
  \"envSizeBytes\": ${ENV_SIZE}"; fi)
}
EOF

mapfile -t META_FILES < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name "${FILE_PREFIX}_*.meta.json" | sort -r)
if (( ${#META_FILES[@]} > BACKUP_RETENTION_COUNT )); then
  for META in "${META_FILES[@]:BACKUP_RETENTION_COUNT}"; do
    BASE="${META%.meta.json}"
    rm -f "${META}" "${BASE}.sql.gz" "${BASE}.env"
  done
fi

printf '%s\n' "${META_PATH}"
