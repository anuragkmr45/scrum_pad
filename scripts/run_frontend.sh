#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/frontend/.env.local"
if [[ ! -f "$ENV_FILE" && -f "$ROOT_DIR/frontend/.env" ]]; then
  ENV_FILE="$ROOT_DIR/frontend/.env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing frontend/.env.local or frontend/.env. Create one with:"
  echo "  cp frontend/.env.local.example frontend/.env.local"
fi

if [[ -f "$ENV_FILE" ]] && ! grep -q '^REACT_APP_AGORA_APP_ID=.' "$ENV_FILE"; then
  echo "Warning: REACT_APP_AGORA_APP_ID is empty. The UI can load, but live collaboration cannot join."
fi

if [[ -f "$ENV_FILE" ]] && ! grep -q '^REACT_APP_LIBRE_BACKEND_URL=.' "$ENV_FILE"; then
  echo "Warning: REACT_APP_LIBRE_BACKEND_URL is empty. Document conversion upload will be disabled."
fi

cd "$ROOT_DIR/frontend"
echo "Starting frontend with npm run dev..."
npm run dev
