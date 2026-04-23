#!/usr/bin/env bash
# Публикует содержимое папки match-app/ в репозиторий tindermp (отдельный клон на VPS).
# Запуск: из корня monorepo (где лежит каталог match-app), нап. zakazyffbot:
#   bash match-app/scripts/push-tindermp.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# Корень monorepo: на уровень выше каталога match-app/
ROOT="$(cd "$HERE/../.." && pwd)"
if [[ ! -d "$ROOT/match-app" || ! -d "$ROOT/.git" ]]; then
  echo "Скрипт в match-app/scripts: ожидается monorepo с ./match-app (ты сейчас: $ROOT)" >&2
  exit 1
fi
cd "$ROOT"
if ! git remote get-url tindermp &>/dev/null; then
  git remote add tindermp https://github.com/alantsoff/tindermp.git
fi
echo "[push-tindermp] subtree split --prefix=match-app main …"
SPLIT=$(git subtree split --prefix=match-app main)
echo "[push-tindermp] push -> tindermp main (force) …"
git push tindermp "$SPLIT:main" --force
echo "[push-tindermp] готово. На сервере: cd /var/www/tindermp && git pull origin main && pnpm install && pnpm db:migrate:deploy && pnpm build"
