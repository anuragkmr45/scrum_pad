#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Node: $(node -v 2>/dev/null || echo missing)"
echo "npm: $(npm -v 2>/dev/null || echo missing)"
echo "Note: frontend is old CRA 3 code; Node 16 or 18 is recommended."

echo "Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm install --legacy-peer-deps

echo "Installing converter dependencies..."
cd "$ROOT_DIR/converter-api"
npm install --legacy-peer-deps

cat <<'MSG'
Install complete.

Next:
  cp frontend/.env.local.example frontend/.env.local
  cp converter-api/.env.example converter-api/.env
  ./scripts/run_converter.sh
  ./scripts/run_frontend.sh
MSG
