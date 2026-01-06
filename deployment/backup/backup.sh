#!/usr/bin/env bash
set -euo pipefail

# PostgreSQL logical backup with rotation
# Configure via environment or systemd service EnvironmentFile

: "${BACKUP_DIR:=/var/backups/trade-show-app}"
: "${DB_NAME:=expense_app}"
: "${DB_HOST:=127.0.0.1}"
: "${DB_PORT:=5432}"
: "${DB_USER:=expense_user}"
: "${DB_PASSWORD:=change_me}"
: "${RETENTION_DAYS:=14}"

export PGPASSWORD="$DB_PASSWORD"
mkdir -p "$BACKUP_DIR"

timestamp=$(date +%Y%m%d-%H%M%S)
outfile="$BACKUP_DIR/${DB_NAME}-${timestamp}.sql.gz"

pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges | gzip -9 > "$outfile"

find "$BACKUP_DIR" -type f -name "${DB_NAME}-*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup completed: $outfile"


