#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  git pull --rebase origin main
fi

pnpm install --frozen-lockfile

if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
  pnpm db:migrate:deploy
fi

pnpm build

if pm2 describe match-api >/dev/null 2>&1; then
  pm2 restart match-api --update-env
else
  pm2 start ecosystem.config.cjs --only match-api
fi

if pm2 describe match-web >/dev/null 2>&1; then
  pm2 restart match-web --update-env
else
  pm2 start ecosystem.config.cjs --only match-web
fi

pm2 save

echo "Deploy finished successfully."
