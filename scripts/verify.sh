#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
status=0

run_check() {
  local label="$1"
  shift
  echo
  echo "==> ${label}"
  if "$@"; then
    echo "PASS: ${label}"
  else
    echo "FAIL: ${label}"
    status=1
  fi
}

run_check "frontend env examples" test -f "$ROOT_DIR/frontend/.env.example"
run_check "frontend local env example" test -f "$ROOT_DIR/frontend/.env.local.example"
run_check "converter env example" test -f "$ROOT_DIR/converter-api/.env.example"
run_check "env template preflight" "$ROOT_DIR/scripts/check_env.sh" --templates

run_check "frontend build" bash -lc "cd '$ROOT_DIR/frontend' && npm run build"
run_check "converter build" bash -lc "cd '$ROOT_DIR/converter-api' && npm run build"
run_check "converter lint" bash -lc "cd '$ROOT_DIR/converter-api' && npm run lint"

echo
echo "Checking frontend env template does not expose backend-only secrets..."
if grep -RInE 'CLOUDINARY_API_SECRET|CLOUDINARY_URL|DATABASE_URL|AWS_BUCKET_SECRET|AWS_BUCKET_KEY' \
  "$ROOT_DIR/frontend/.env.example" \
  "$ROOT_DIR/frontend/.env.local.example"; then
  echo "Frontend env template exposes backend-only variables."
  status=1
else
  echo "Frontend env templates only contain public runtime variables."
fi

echo
echo "Checking for likely committed secrets..."
if grep -RInE '(AWS_BUCKET_SECRET|AWS_BUCKET_KEY|CLOUDINARY_API_SECRET|CLOUDINARY_URL|DATABASE_URL|AGORA_APP_CERTIFICATE|REACT_APP_AGORA_APP_ID)=.+[A-Za-z0-9_:/@?&=+.-]{12,}' \
  "$ROOT_DIR" \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='*.lock'; then
  echo "Potential secrets found. Review output above."
  status=1
else
  echo "No obvious secrets found by the simple grep check."
fi

exit "$status"
