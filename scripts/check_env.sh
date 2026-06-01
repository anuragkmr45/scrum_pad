#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:---local}"
status=0
warnings=0

case "$MODE" in
  --templates|--local|--deploy) ;;
  *)
    echo "Usage: $0 [--templates|--local|--deploy]"
    exit 2
    ;;
esac

mark_pass() {
  echo "PASS: $1"
}

mark_warn() {
  echo "WARN: $1"
  warnings=$((warnings + 1))
}

mark_fail() {
  echo "FAIL: $1"
  status=1
}

env_value() {
  local file="$1"
  local key="$2"
  awk -v wanted="$key" '
    /^[[:space:]]*(#|$)/ { next }
    {
      line=$0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      split(line, parts, "=")
      left=parts[1]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", left)
      if (left == wanted) {
        sub(/^[^=]*=/, "", line)
        sub(/[[:space:]]+#.*$/, "", line)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if ((line ~ /^".*"$/) || (line ~ /^'\''.*'\''$/)) {
          line=substr(line, 2, length(line) - 2)
        }
        print line
        exit
      }
    }
  ' "$file"
}

env_has_key() {
  local file="$1"
  local key="$2"
  awk -v wanted="$key" '
    /^[[:space:]]*(#|$)/ { next }
    {
      line=$0
      sub(/^[[:space:]]*export[[:space:]]+/, "", line)
      split(line, parts, "=")
      left=parts[1]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", left)
      if (left == wanted) found=1
    }
    END { exit found ? 0 : 1 }
  ' "$file"
}

is_placeholder() {
  local value="$1"
  local lowered
  lowered="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$value" ]] && return 0
  [[ "$lowered" == "todo" ]] && return 0
  [[ "$lowered" == "tbd" ]] && return 0
  [[ "$lowered" == "changeme" ]] && return 0
  [[ "$lowered" == "change_me" ]] && return 0
  [[ "$lowered" == "replace_me" ]] && return 0
  [[ "$lowered" == "placeholder" ]] && return 0
  [[ "$lowered" == "example" ]] && return 0
  [[ "$lowered" == your-* ]] && return 0
  [[ "$lowered" == your_* ]] && return 0
  [[ "$lowered" == *"your-"* ]] && return 0
  [[ "$lowered" == *"your_"* ]] && return 0
  [[ "$lowered" == \<*\> ]] && return 0
  return 1
}

require_key_in_template() {
  local file="$1"
  local key="$2"
  if env_has_key "$file" "$key"; then
    mark_pass "$file contains $key"
  else
    mark_fail "$file is missing $key"
  fi
}

require_value() {
  local file="$1"
  local key="$2"
  local label="$3"
  local value
  value="$(env_value "$file" "$key")"
  if is_placeholder "$value"; then
    mark_fail "$label is missing or placeholder"
  else
    mark_pass "$label is set"
  fi
}

require_optional_default() {
  local file="$1"
  local key="$2"
  local label="$3"
  if env_has_key "$file" "$key"; then
    mark_pass "$label is present"
  else
    mark_warn "$label is absent; code has a fallback"
  fi
}

require_bool() {
  local file="$1"
  local key="$2"
  local label="$3"
  local value
  value="$(env_value "$file" "$key")"
  if [[ "$value" == "true" || "$value" == "false" ]]; then
    mark_pass "$label is boolean"
  else
    mark_fail "$label must be true or false"
  fi
}

require_positive_number() {
  local file="$1"
  local key="$2"
  local label="$3"
  local value
  value="$(env_value "$file" "$key")"
  if [[ "$value" =~ ^[0-9]+$ && "$value" -gt 0 ]]; then
    mark_pass "$label is a positive number"
  else
    mark_fail "$label must be a positive number"
  fi
}

require_exact_value() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local label="$4"
  local value
  value="$(env_value "$file" "$key")"
  if [[ "$value" == "$expected" ]]; then
    mark_pass "$label is $expected"
  else
    mark_fail "$label must be $expected for deployment"
  fi
}

require_url() {
  local file="$1"
  local key="$2"
  local label="$3"
  local allow_local="${4:-yes}"
  local value
  value="$(env_value "$file" "$key")"
  if is_placeholder "$value"; then
    mark_fail "$label is missing or placeholder"
    return
  fi
  if [[ ! "$value" =~ ^https?:// ]]; then
    mark_fail "$label must start with http:// or https://"
    return
  fi
  if [[ "$allow_local" == "no" && "$value" =~ (localhost|127\.0\.0\.1|0\.0\.0\.0) ]]; then
    mark_fail "$label must not point to localhost for deployment"
    return
  fi
  if [[ "$value" =~ /upload/?$ ]]; then
    mark_warn "$label should be the backend base URL, not the /upload endpoint"
  fi
  mark_pass "$label is a URL"
}

require_url_list() {
  local file="$1"
  local key="$2"
  local label="$3"
  local allow_local="${4:-yes}"
  local value
  value="$(env_value "$file" "$key")"
  if is_placeholder "$value"; then
    mark_fail "$label is missing or placeholder"
    return
  fi

  local ok=1
  local item
  IFS=',' read -ra parts <<< "$value"
  for item in "${parts[@]}"; do
    item="$(printf '%s' "$item" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [[ ! "$item" =~ ^https?:// ]]; then
      mark_fail "$label contains an origin that is not http(s)"
      ok=0
      continue
    fi
    if [[ "$allow_local" == "no" && "$item" =~ (localhost|127\.0\.0\.1|0\.0\.0\.0) ]]; then
      mark_fail "$label must not include localhost for deployment"
      ok=0
    fi
  done
  [[ "$ok" -eq 1 ]] && mark_pass "$label origin list is valid"
}

require_value_in_list() {
  local file="$1"
  local key="$2"
  local list_key="$3"
  local label="$4"
  local value
  local list
  local item
  value="$(env_value "$file" "$key")"
  list="$(env_value "$file" "$list_key")"
  if is_placeholder "$value" || is_placeholder "$list"; then
    return
  fi
  IFS=',' read -ra parts <<< "$list"
  for item in "${parts[@]}"; do
    item="$(printf '%s' "$item" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [[ "$item" == "$value" ]]; then
      mark_pass "$label"
      return
    fi
  done
  mark_fail "$list_key must include $key"
}

require_postgres_url() {
  local file="$1"
  local key="$2"
  local label="$3"
  local value
  value="$(env_value "$file" "$key")"
  if is_placeholder "$value"; then
    mark_fail "$label is missing or placeholder"
    return
  fi
  if [[ "$value" =~ ^postgres(ql)?:// ]]; then
    mark_pass "$label looks like a Postgres URL"
  else
    mark_fail "$label must start with postgres:// or postgresql://"
  fi
}

require_cloudinary() {
  local file="$1"
  local cloudinary_url
  local cloud_name
  local api_key
  local api_secret
  cloudinary_url="$(env_value "$file" "CLOUDINARY_URL")"
  cloud_name="$(env_value "$file" "CLOUDINARY_CLOUD_NAME")"
  api_key="$(env_value "$file" "CLOUDINARY_API_KEY")"
  api_secret="$(env_value "$file" "CLOUDINARY_API_SECRET")"

  if ! is_placeholder "$cloudinary_url"; then
    if [[ "$cloudinary_url" =~ ^cloudinary:// ]]; then
      mark_pass "Cloudinary URL is set"
    else
      mark_fail "CLOUDINARY_URL must start with cloudinary://"
    fi
    return
  fi

  local ok=1
  if is_placeholder "$cloud_name"; then
    mark_fail "CLOUDINARY_CLOUD_NAME is missing or placeholder"
    ok=0
  fi
  if is_placeholder "$api_key"; then
    mark_fail "CLOUDINARY_API_KEY is missing or placeholder"
    ok=0
  fi
  if is_placeholder "$api_secret"; then
    mark_fail "CLOUDINARY_API_SECRET is missing or placeholder"
    ok=0
  fi
  [[ "$ok" -eq 1 ]] && mark_pass "Cloudinary name/key/secret are set"
}

check_agora_backend_token_config() {
  local file="$1"
  local strict="$2"
  local app_id
  local app_certificate
  app_id="$(env_value "$file" AGORA_APP_ID)"
  app_certificate="$(env_value "$file" AGORA_APP_CERTIFICATE)"

  if ! is_placeholder "$app_id" && ! is_placeholder "$app_certificate"; then
    mark_pass "Agora RTM token backend is configured"
    return
  fi

  if [[ "$strict" == "yes" ]]; then
    mark_fail "AGORA_APP_ID and AGORA_APP_CERTIFICATE are required when Agora App Certificate is enabled"
  else
    mark_warn "Agora RTM token backend is not configured; tokenless login only works if App Certificate is disabled in Agora"
  fi
}

check_upload_limit_match() {
  local frontend_env="$1"
  local backend_env="$2"
  local frontend_max
  local backend_max
  [[ -f "$frontend_env" && -f "$backend_env" ]] || return
  frontend_max="$(env_value "$frontend_env" REACT_APP_MAX_UPLOAD_MB)"
  backend_max="$(env_value "$backend_env" MAX_UPLOAD_MB)"
  if [[ "$frontend_max" =~ ^[0-9]+$ && "$backend_max" =~ ^[0-9]+$ ]]; then
    if [[ "$frontend_max" -le "$backend_max" ]]; then
      mark_pass "frontend upload limit does not exceed backend limit"
    else
      mark_fail "REACT_APP_MAX_UPLOAD_MB must not exceed backend MAX_UPLOAD_MB"
    fi
  fi
}

check_frontend_forbidden_keys() {
  local file="$1"
  local forbidden=(
    CLOUDINARY_CLOUD_NAME
    CLOUDINARY_API_KEY
    CLOUDINARY_API_SECRET
    CLOUDINARY_URL
    CLOUDINARY_FOLDER
    DATABASE_URL
    DATABASE_SSL
    STORAGE_PROVIDER
    AWS_BUCKET_KEY
    AWS_BUCKET_SECRET
    AGORA_APP_ID
    AGORA_APP_CERTIFICATE
    AGORA_RTM_TOKEN_TTL_SECONDS
  )
  local found=0
  for key in "${forbidden[@]}"; do
    if env_has_key "$file" "$key"; then
      mark_fail "frontend env must not contain backend-only key $key"
      found=1
    fi
  done
  [[ "$found" -eq 0 ]] && mark_pass "frontend env has no backend-only keys"
}

check_sensitive_file_ignored() {
  local repo="$1"
  local file="$2"
  if [[ ! -f "$repo/$file" ]]; then
    return
  fi
  if git -C "$repo" check-ignore -q "$file"; then
    mark_pass "$repo/$file is git-ignored"
  else
    mark_fail "$repo/$file exists but is not git-ignored"
  fi
}

check_templates() {
  local frontend_example="$ROOT_DIR/frontend/.env.example"
  local frontend_local_example="$ROOT_DIR/frontend/.env.local.example"
  local backend_example="$ROOT_DIR/converter-api/.env.example"

  echo "==> Env templates"
  for file in "$frontend_example" "$frontend_local_example" "$backend_example"; do
    if [[ -f "$file" ]]; then
      mark_pass "$file exists"
    else
      mark_fail "$file is missing"
    fi
  done

  for file in "$frontend_example" "$frontend_local_example"; do
    [[ -f "$file" ]] || continue
    require_key_in_template "$file" REACT_APP_AGORA_APP_ID
    require_key_in_template "$file" REACT_APP_AGORA_LOG
    require_key_in_template "$file" REACT_APP_LIBRE_BACKEND_URL
    require_key_in_template "$file" REACT_APP_HEXSCRUM_MODE
    require_key_in_template "$file" REACT_APP_MAX_UPLOAD_MB
    check_frontend_forbidden_keys "$file"
  done

  if [[ -f "$backend_example" ]]; then
    for key in PORT NODE_ENV FRONTEND_ORIGIN CORS_ORIGINS MAX_UPLOAD_MB STORAGE_PROVIDER CLOUDINARY_CLOUD_NAME CLOUDINARY_API_KEY CLOUDINARY_API_SECRET CLOUDINARY_URL CLOUDINARY_FOLDER DATABASE_URL DATABASE_SSL AGORA_APP_ID AGORA_APP_CERTIFICATE AGORA_RTM_TOKEN_TTL_SECONDS; do
      require_key_in_template "$backend_example" "$key"
    done
  fi
}

pick_frontend_env() {
  if [[ -f "$ROOT_DIR/frontend/.env.local" ]]; then
    printf '%s\n' "$ROOT_DIR/frontend/.env.local"
  elif [[ -f "$ROOT_DIR/frontend/.env" ]]; then
    printf '%s\n' "$ROOT_DIR/frontend/.env"
  else
    printf '%s\n' ""
  fi
}

check_actual_env() {
  local strict="$1"
  local frontend_env
  local backend_env="$ROOT_DIR/converter-api/.env"
  frontend_env="$(pick_frontend_env)"

  echo
  echo "==> Sensitive env file ignore rules"
  check_sensitive_file_ignored "$ROOT_DIR/frontend" ".env"
  check_sensitive_file_ignored "$ROOT_DIR/frontend" ".env.local"
  check_sensitive_file_ignored "$ROOT_DIR/converter-api" ".env"

  echo
  echo "==> Frontend runtime env"
  if [[ -z "$frontend_env" ]]; then
    if [[ "$strict" == "yes" ]]; then
      mark_fail "frontend/.env.local or frontend/.env is required for deploy preflight"
    else
      mark_warn "frontend/.env.local or frontend/.env not found"
    fi
  else
    mark_pass "frontend env file exists"
    if [[ -f "$ROOT_DIR/frontend/.env.local" && -f "$ROOT_DIR/frontend/.env" ]]; then
      mark_warn "both frontend/.env.local and frontend/.env exist; CRA precedence can be confusing"
    fi
    check_frontend_forbidden_keys "$frontend_env"
    require_value "$frontend_env" REACT_APP_AGORA_APP_ID "REACT_APP_AGORA_APP_ID"
    require_bool "$frontend_env" REACT_APP_AGORA_LOG "REACT_APP_AGORA_LOG"
    require_url "$frontend_env" REACT_APP_LIBRE_BACKEND_URL "REACT_APP_LIBRE_BACKEND_URL" "$([[ "$strict" == "yes" ]] && echo no || echo yes)"
    if [[ "$strict" == "yes" ]]; then
      require_exact_value "$frontend_env" REACT_APP_HEXSCRUM_MODE production "REACT_APP_HEXSCRUM_MODE"
    else
      require_value "$frontend_env" REACT_APP_HEXSCRUM_MODE "REACT_APP_HEXSCRUM_MODE"
    fi
    require_positive_number "$frontend_env" REACT_APP_MAX_UPLOAD_MB "REACT_APP_MAX_UPLOAD_MB"
    require_optional_default "$frontend_env" REACT_APP_VERSION "REACT_APP_VERSION"
  fi

  echo
  echo "==> Backend runtime env"
  if [[ ! -f "$backend_env" ]]; then
    if [[ "$strict" == "yes" ]]; then
      mark_fail "converter-api/.env is required for deploy preflight"
    else
      mark_warn "converter-api/.env not found"
    fi
    return
  fi

  mark_pass "converter-api/.env exists"
  require_positive_number "$backend_env" PORT "PORT"
  if [[ "$strict" == "yes" ]]; then
    require_exact_value "$backend_env" NODE_ENV production "NODE_ENV"
  else
    require_value "$backend_env" NODE_ENV "NODE_ENV"
  fi
  require_url "$backend_env" FRONTEND_ORIGIN "FRONTEND_ORIGIN" "$([[ "$strict" == "yes" ]] && echo no || echo yes)"
  require_url_list "$backend_env" CORS_ORIGINS "CORS_ORIGINS" "$([[ "$strict" == "yes" ]] && echo no || echo yes)"
  require_value_in_list "$backend_env" FRONTEND_ORIGIN CORS_ORIGINS "CORS_ORIGINS includes FRONTEND_ORIGIN"
  require_positive_number "$backend_env" MAX_UPLOAD_MB "MAX_UPLOAD_MB"
  check_upload_limit_match "$frontend_env" "$backend_env"

  local storage_provider
  storage_provider="$(env_value "$backend_env" STORAGE_PROVIDER)"
  if [[ "$storage_provider" == "cloudinary" ]]; then
    mark_pass "STORAGE_PROVIDER is cloudinary"
  else
    mark_fail "STORAGE_PROVIDER must be cloudinary"
  fi

  require_cloudinary "$backend_env"
  require_value "$backend_env" CLOUDINARY_FOLDER "CLOUDINARY_FOLDER"
  require_postgres_url "$backend_env" DATABASE_URL "DATABASE_URL"
  check_agora_backend_token_config "$backend_env" "$strict"
  require_optional_default "$backend_env" AGORA_RTM_TOKEN_TTL_SECONDS "AGORA_RTM_TOKEN_TTL_SECONDS"
  if [[ "$strict" == "yes" ]]; then
    require_exact_value "$backend_env" DATABASE_SSL true "DATABASE_SSL"
  else
    require_bool "$backend_env" DATABASE_SSL "DATABASE_SSL"
  fi
}

check_templates

if [[ "$MODE" == "--local" ]]; then
  check_actual_env "no"
fi

if [[ "$MODE" == "--deploy" ]]; then
  check_actual_env "yes"
fi

echo
echo "Env preflight complete: ${warnings} warning(s), status=${status}"
exit "$status"
