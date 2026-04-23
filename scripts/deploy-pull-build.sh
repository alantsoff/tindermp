#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_ENV_FILE="${API_ENV_FILE:-apps/api/.env}"
WEB_ENV_FILE="${WEB_ENV_FILE:-apps/web/.env.production}"
if [[ ! -f "$WEB_ENV_FILE" ]]; then
  WEB_ENV_FILE="apps/web/.env.local"
fi

fail() {
  echo "[deploy] ERROR: $1" >&2
  exit 1
}

is_truthy() {
  local value="${1:-}"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" ]]
}

env_from_file() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0

  local line
  line="$(awk -F= -v key="$key" '
    /^[[:space:]]*#/ { next }
    $1 ~ /^[[:space:]]*$/ { next }
    {
      rawKey=$1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", rawKey)
      if (rawKey == key) {
        sub(/^[^=]*=/, "", $0)
        print $0
        exit
      }
    }
  ' "$file")"

  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

ensure_required_env() {
  local key="$1"
  local file="$2"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    value="$(env_from_file "$file" "$key")"
  fi
  if [[ -z "$value" ]]; then
    fail "Required env '$key' is missing (checked process env and $file)"
  fi
  export "$key=$value"
}

validate_no_placeholder() {
  local key="$1"
  local value="${!key:-}"
  if [[ "$value" =~ ^YOUR_ ]]; then
    fail "Env '$key' still contains placeholder value: $value"
  fi
}

ensure_database_pool_params() {
  local url="${DATABASE_URL:-}"
  [[ -n "$url" ]] || fail "DATABASE_URL is empty"

  if [[ "$url" != *"connection_limit="* ]]; then
    fail "DATABASE_URL must include connection_limit (recommended: 15)"
  fi
  if [[ "$url" != *"pool_timeout="* ]]; then
    fail "DATABASE_URL must include pool_timeout in seconds (recommended: 10)"
  fi
}

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  git pull --rebase origin main
fi

ensure_required_env "DATABASE_URL" "$API_ENV_FILE"
ensure_required_env "MATCH_BOT_TOKEN" "$API_ENV_FILE"
ensure_required_env "MATCH_JWT_SECRET" "$API_ENV_FILE"
ensure_required_env "NEXT_PUBLIC_API_URL" "$WEB_ENV_FILE"
ensure_required_env "NEXT_INTERNAL_API_URL" "$WEB_ENV_FILE"

validate_no_placeholder "MATCH_BOT_TOKEN"
ensure_database_pool_params

if is_truthy "${MATCH_DEV_AUTH_BYPASS:-0}"; then
  fail "MATCH_DEV_AUTH_BYPASS must be disabled on production deploy"
fi
if is_truthy "${NEXT_PUBLIC_MATCH_DEV_AUTH_BYPASS:-0}"; then
  fail "NEXT_PUBLIC_MATCH_DEV_AUTH_BYPASS must be disabled on production deploy"
fi

pnpm install --frozen-lockfile

pnpm db:generate

pnpm build

echo "[deploy] Running DB connectivity preflight..."
pnpm --filter @match/api exec node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.\$queryRaw\`select 1\`.then(() => p.\$disconnect()).catch((error) => { console.error(error); process.exit(1); });"

if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  pnpm db:migrate:deploy
else
  echo "[deploy] SKIP_MIGRATE=1: migrations skipped"
fi

# Recreate processes to avoid stale script/args in PM2 runtime.
pm2 delete match-api || true
pm2 delete match-web || true
pm2 start ecosystem.config.cjs --only match-api --env production
pm2 start ecosystem.config.cjs --only match-web --env production

pm2 save

API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3100}"

echo "[deploy] Waiting for health endpoints..."
for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/match-api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${API_PORT}/match-api/health" >/dev/null

for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://127.0.0.1:${WEB_PORT}/" >/dev/null

echo "Deploy finished successfully."
