#!/usr/bin/env bash
#
# FLUX — start all development servers (shared watcher, NestJS,
# Vite) with a single command.
#
# Usage:  ./scripts/start-dev.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "Checking Docker infrastructure..."
if ! docker compose ps --format '{{.Name}} {{.State}}' | grep -q "tglike-postgres running"; then
  echo "Starting Docker infrastructure..."
  docker compose up -d postgres redis seaweedfs coturn
  echo "Waiting for services to become ready..."
  sleep 8
else
  echo "Docker infrastructure already running."
fi
echo ""

if [ ! -f .env ]; then
  echo "ERROR: .env is missing. Run ./scripts/install-all.sh first."
  exit 1
fi

echo "Starting shared / server / web in watch mode."
echo "Press Ctrl+C to stop everything."
echo ""

trap 'echo ""; echo "Stopping servers..."; kill 0 2>/dev/null || true; exit 0' INT TERM
pnpm dev
