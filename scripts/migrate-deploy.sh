#!/usr/bin/env bash
# Всегда грузит apps/api/.env и вызывает Prisma (обход P1012).
# Запуск: из корня репозитория: bash scripts/migrate-deploy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node packages/db/prisma-with-api-env.cjs migrate deploy --schema prisma/schema.prisma
