#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

"$ROOT_DIR/scripts/check_env.sh" --local

cd "$ROOT_DIR/converter-api"
echo "Starting converter API with hot reload on http://localhost:4000..."
npm run dev &
API_PID=$!

cd "$ROOT_DIR/frontend"
echo "Starting frontend with hot reload on http://localhost:3000..."
npm run dev
