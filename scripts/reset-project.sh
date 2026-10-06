#!/usr/bin/env bash
#
# FLUX — reset local state.
#
# Stops the Docker stack, deletes its data volumes, removes node_modules and
# build outputs. Source code is NEVER touched.
#
# Usage:  ./scripts/reset-project.sh [--yes]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

if [ "${1:-}" != "--yes" ]; then
  echo "WARNING: this deletes ALL local data (database, Redis, object storage)"
  echo "         and reinstalls nothing. Source code is preserved."
  read -r -p "Type 'yes' to continue: " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Reset cancelled."
    exit 0
  fi
fi

echo "Step 1/4: Stopping containers and removing data volumes..."
docker compose down -v || true
echo ""

echo "Step 2/4: Removing node_modules and pnpm store links..."
find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
echo ""

echo "Step 3/4: Removing build outputs..."
find . -name "dist" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find apps -name "release" -type d -prune -exec rm -rf {} + 2>/dev/null || true
rm -f apps/server/tsconfig.tsbuildinfo packages/shared/tsconfig.tsbuildinfo
rm -f apps/web/tsconfig.tsbuildinfo apps/web/tsconfig.node.tsbuildinfo
echo ""

echo "Step 4/4: Removing local .env files (secrets are never committed)..."
rm -f .env apps/server/.env
echo ""

echo "=========================================="
echo "Reset completed. To reinstall run:"
echo "  ./scripts/install-all.sh"
echo "=========================================="
