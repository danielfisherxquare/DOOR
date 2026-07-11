#!/bin/bash
set -euo pipefail

INPUT_PATH=""
TARGET_DB=""
RESULT_FILE=""
ENV_FILE=""
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
    --env-file)
      ENV_FILE="${2:-}"
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

if [[ "${INPUT_PATH}" != *.dump ]]; then
  echo "Only PostgreSQL custom .dump archives are supported" >&2
  exit 1
fi

if [[ ! "${TARGET_DB}" =~ ^door_restore_[A-Za-z0-9_]{1,48}$ ]]; then
  echo "Unsafe restore target database name: ${TARGET_DB}" >&2
  exit 1
fi

ENV_SNAPSHOT_PROVIDED=false
if [[ -n "${ENV_FILE}" ]]; then
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Environment snapshot not found: ${ENV_FILE}" >&2
    exit 1
  fi
  ENV_SNAPSHOT_PROVIDED=true
fi

if ! mkdir "${DB_OPS_LOCK_DIR}" 2>/dev/null; then
  echo "Another backup/restore operation is already running" >&2
  exit 1
fi

cleanup() {
  rm -f "${ARCHIVE_LIST_PATH:-}"
  rmdir "${DB_OPS_LOCK_DIR}" 2>/dev/null || true
}

trap cleanup EXIT

ARCHIVE_LIST_PATH="${RESULT_FILE}.toc.tmp"
if ! pg_restore --list "${INPUT_PATH}" > "${ARCHIVE_LIST_PATH}"; then
  echo "Invalid PostgreSQL custom archive: ${INPUT_PATH}" >&2
  exit 1
fi

UNSAFE_ARCHIVE_LINE="$(grep -E '^[0-9-]+; [0-9]+ [0-9]+ (DATABASE( PROPERTIES)?|TABLESPACE|EXTENSION|PROCEDURAL LANGUAGE|FUNCTION|PROCEDURE|TRIGGER|EVENT TRIGGER|FOREIGN DATA WRAPPER|SERVER|USER MAPPING|PUBLICATION|SUBSCRIPTION)( |$)' "${ARCHIVE_LIST_PATH}" | head -n 1 || true)"
if [[ -n "${UNSAFE_ARCHIVE_LINE}" ]]; then
  echo "Unsafe archive object type: ${UNSAFE_ARCHIVE_LINE}" >&2
  exit 1
fi

DB_EXISTS="$(psql "${ADMIN_DATABASE_URL}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${TARGET_DB}'" | tr -d '[:space:]')"
if [[ "${DB_EXISTS}" == "1" ]]; then
  echo "Target database already exists: ${TARGET_DB}" >&2
  exit 1
fi

psql "${ADMIN_DATABASE_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\";"
pg_restore \
  --exit-on-error \
  --no-owner \
  --no-acl \
  --dbname="${DATABASE_URL%/*}/${TARGET_DB}" \
  "${INPUT_PATH}" >/dev/null

CONNECTIVITY=false
MIGRATION_TABLE_PRESENT=false
TABLES_PRESENT=false

if psql "${DATABASE_URL%/*}/${TARGET_DB}" -tAc "SELECT 1" >/dev/null 2>&1; then
  CONNECTIVITY=true
fi

if [[ "$(psql "${DATABASE_URL%/*}/${TARGET_DB}" -tAc "SELECT to_regclass('public.knex_migrations') IS NOT NULL" | tr -d '[:space:]')" == "t" ]]; then
  MIGRATION_TABLE_PRESENT=true
fi

TABLE_COUNT="$(psql "${DATABASE_URL%/*}/${TARGET_DB}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'organizations', 'races', 'records')" | tr -d '[:space:]')"
if [[ "${TABLE_COUNT}" == "4" ]]; then
  TABLES_PRESENT=true
fi

RESTORED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "${RESULT_FILE}" <<EOF
{
  "targetDatabase": "${TARGET_DB}",
  "restoredAt": "${RESTORED_AT}",
  "envSnapshotProvided": ${ENV_SNAPSHOT_PROVIDED},
  "checks": {
    "connectivity": ${CONNECTIVITY},
    "migrationTablePresent": ${MIGRATION_TABLE_PRESENT},
    "tablesPresent": ${TABLES_PRESENT}
  }
}
EOF

if [[ "${CONNECTIVITY}" != "true" || "${MIGRATION_TABLE_PRESENT}" != "true" || "${TABLES_PRESENT}" != "true" ]]; then
  echo "Restore verification failed for ${TARGET_DB}" >&2
  exit 1
fi
