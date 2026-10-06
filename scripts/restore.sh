#!/usr/bin/env bash
# Restores a database dump (and optionally the files archive). DESTROYS current data.
# Usage: scripts/restore.sh db-XXXX.dump [files-XXXX.tar.gz]
set -euo pipefail
DB_DUMP="${1:?usage: restore.sh db.dump [files.tar.gz]}"
FILES="${2:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

read -r -p "This replaces the current database. Type 'yes' to continue: " ok
[ "$ok" = "yes" ] || exit 1

dc stop server
dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$DB_DUMP"
if [ -n "$FILES" ]; then
  gunzip -c "$FILES" | dc exec -T seaweedfs tar -C /data -xf -
  dc restart seaweedfs
fi
dc up -d server
echo "restore ok"
