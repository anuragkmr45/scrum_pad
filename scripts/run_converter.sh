#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/converter-api/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing converter-api/.env. Create it with:"
  echo "  cp converter-api/.env.example converter-api/.env"
fi

if [[ -f "$ENV_FILE" ]]; then
  for key in STORAGE_PROVIDER; do
    if ! grep -q "^${key}=." "$ENV_FILE"; then
      echo "Warning: ${key} is empty. /health will work, but Cloudinary uploads will fail until storage is configured."
    fi
  done
  if ! grep -q '^CLOUDINARY_URL=.' "$ENV_FILE"; then
    for key in CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET; do
      if ! grep -q "^${key}=." "$ENV_FILE"; then
        echo "Warning: ${key} is empty. Set it or CLOUDINARY_URL before testing uploads."
      fi
    done
  fi
  if ! grep -q '^DATABASE_URL=.' "$ENV_FILE"; then
    echo "Warning: DATABASE_URL is empty. Audit/report APIs will use in-memory data for this process."
  fi
fi

cd "$ROOT_DIR/converter-api"
echo "Starting converter with npm run dev..."
npm run dev
