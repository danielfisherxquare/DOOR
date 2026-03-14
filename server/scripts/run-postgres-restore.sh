#!/bin/bash
set -euo pipefail

INPUT_PATH=""
TARGET_DB=""
RESULT_FILE=""
DB_OPS_LOCK_DIR="${DB_OPS_LOCK_DIR:-/tmp/door-db-ops.lock}"
DATABASE_URL="${DATABASE_URL:-postgres://door:door_dev@postgres:5432/door}"
ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-${DATABASE_URL%/*}/postgres}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      INPUT_PATH="${2:-}"
      shift 2
      ;;
    --target-db)
      TARGET_DB="${2:-}"
      shift 2
      ;;
    --result-file)
      RESULT_FILE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${INPUT_PATH}" || -z "${TARGET_DB}" || -z "${RESULT_FILE}" ]]; then
  echo "Usage: run-postgres-restore.sh --input <file> --target-db <db> --result-file <file>" >&2
  exit 1
fi

if [[ ! -f "${INPUT_PATH}" ]]; then
  echo "Restore input not found: ${INPUT_PATH}" >&2
  exit 1
fi

if [[ "${INPUT_PATH}" != *.sql.gz ]]; then
  echo "Only .sql.gz backups are supported" >&2
  exit 1
fi

if ! mkdir "${DB_OPS_LOCK_DIR}" 2>/dev/null; then
  echo "Another backup/restore operation is already running" >&2
  exit 1
fi

cleanup() {
  rmdir "${DB_OPS_LOCK_DIR}" 2>/dev/null || true
}

trap cleanup EXIT

DB_EXISTS="$(psql "${ADMIN_DATABASE_URL}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${TARGET_DB}'" | tr -d '[:space:]')"
if [[ "${DB_EXISTS}" == "1" ]]; then
  echo "Target database already exists: ${TARGET_DB}" >&2
  exit 1
fi

psql "${ADMIN_DATABASE_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\";"
gzip -dc "${INPUT_PATH}" | psql "${DATABASE_URL%/*}/${TARGET_DB}" -v ON_ERROR_STOP=1 >/dev/null

CONNECTIVITY=false
MIGRATION_TABLE_PRESENT=false
TABLES_PRESENT=false

if psql "${DATABASE_URL%/*}/${TARGET_DB}" -tAc "SELECT 1" >/dev/null 2>&1; then
  CONNECTIVITY=true
fi

if [[ "$(psql "${DATABASE_URL%/*}/${TARGET_DB}" -tAc "SELECT to_regclass('public.knex_migrations') IS NOT NULL" | tr -d '[:space:]')" == "t" ]]; then
  MIGRATION_TABLE_PRESENT=true
fi

TABLE_COUNT="$(psql "${DATABASE_URL%/*}/${TARGET_DB}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'orgs', 'races', 'records')" | tr -d '[:space:]')"
if [[ "${TABLE_COUNT}" == "4" ]]; then
  TABLES_PRESENT=true
fi

RESTORED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "${RESULT_FILE}" <<EOF
{
  "targetDatabase": "${TARGET_DB}",
  "restoredAt": "${RESTORED_AT}",
  "checks": {
    "connectivity": ${CONNECTIVITY},
    "migrationTablePresent": ${MIGRATION_TABLE_PRESENT},
    "tablesPresent": ${TABLES_PRESENT}
  }
}
EOF
