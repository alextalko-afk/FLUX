#!/usr/bin/env bash
# Backs up PostgreSQL (pg_dump, custom format) and the object store volume.
# Usage: scripts/backup.sh [backup_dir]    Env: COMPOSE_FILE, ENV_FILE, KEEP_DAYS (default 14)
set -euo pipefail
DIR="${1:-./backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

mkdir -p "$DIR"
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DIR/db-$STAMP.dump"
dc exec -T seaweedfs tar -C /data -cf - . | gzip > "$DIR/files-$STAMP.tar.gz"
find "$DIR" -name 'db-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$DIR" -name 'files-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "backup ok: $DIR/db-$STAMP.dump, $DIR/files-$STAMP.tar.gz"
