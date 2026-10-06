#!/usr/bin/env bash
#
# FLUX — one-shot local installation.
#
# It installs dependencies, prepares .env, starts the Docker infrastructure,
# applies database migrations and builds every workspace package.
#
# Usage:  ./scripts/install-all.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "=========================================="
echo "FLUX — Full Installation"
echo "=========================================="
echo ""

echo "Step 1/7: Checking required tools..."
command -v node >/dev/null 2>&1 || { echo "ERROR: node is not installed (need Node.js 22+)"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm is not installed (npm i -g pnpm)"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker is not installed"; exit 1; }
node -e 'const major = Number(process.versions.node.split(".")[0]); if (major < 22) { console.error("ERROR: Node.js 22+ is required, found " + process.versions.node); process.exit(1); }'
echo "OK: $(node -v), pnpm $(pnpm -v)"
echo ""

echo "Step 2/7: Creating .env (if missing)..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo "IMPORTANT: replace JWT_ACCESS_SECRET / JWT_REFRESH_SECRET before production use."
else
  echo ".env already exists, keeping it."
fi
echo ""

echo "Step 3/7: Installing dependencies..."
pnpm install
echo ""

echo "Step 4/7: Starting Docker infrastructure (postgres, redis, seaweedfs, coturn, nginx)..."
docker compose up -d postgres redis seaweedfs coturn
echo ""

echo "Step 5/7: Waiting for PostgreSQL and Redis..."
for i in $(seq 1 60); do
  if docker exec tglike-postgres pg_isready -U tguser -d tglike >/dev/null 2>&1; then
    echo "PostgreSQL is ready."
    break
  fi
  if [ "$i" -eq 60 ]; then echo "ERROR: PostgreSQL did not become ready in time."; exit 1; fi
  sleep 1
done

for i in $(seq 1 60); do
  if docker exec tglike-redis redis-cli ping >/dev/null 2>&1; then
    echo "Redis is ready."
    break
  fi
  if [ "$i" -eq 60 ]; then echo "ERROR: Redis did not become ready in time."; exit 1; fi
  sleep 1
done
echo ""

echo "Step 6/7: Generating Prisma client and applying migrations..."
pnpm prisma:generate
pnpm prisma:deploy
echo ""

echo "Step 7/7: Building shared / server / web..."
pnpm build
echo ""

echo "=========================================="
echo "Installation completed successfully."
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Create the first administrator (no demo accounts are ever created):"
echo "     pnpm cli:admin --email=admin@example.com --password='ChangeMe123!' --username=admin"
echo ""
echo "  2. Start development servers:"
echo "     ./scripts/start-dev.sh"
echo ""
echo "  3. Or start the production build:"
echo "     pnpm --filter @FLUX/server run start:prod"
echo ""
echo "  4. Endpoints:"
echo "     - Web client (dev):  http://localhost:5173"
echo "     - REST API:          http://localhost:3000/api/v1"
echo "     - Health:            http://localhost:3000/api/v1/health"
echo "     - S3 gateway:        http://localhost:9000"
echo "     - SeaweedFS UI:      http://localhost:8888"
echo ""
echo "  Run the end-to-end verification at any time:"
echo "     pnpm smoke"
echo ""
