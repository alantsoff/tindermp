# Deploy to VPS (PM2 + Nginx)

## Репозиторий на сервере (tindermp)

Прод-репо для клона на VPS: **`https://github.com/alantsoff/tindermp`** — в нём **только** содержимое папки `match-app` из monorepo (корень = `apps/`, `packages/`, а не `match-app/apps`).

Обновлять tindermp с машины, где лежит monorepo (например `zakazyffbot` с каталогом `match-app`):

```bash
bash match-app/scripts/push-tindermp.sh
```

(первый раз при необходимости: `git remote add tindermp https://github.com/alantsoff/tindermp.git` в корне monorepo; скрипт добавит remote сам). Пуш **перезаписывает** `main` на tindermp (`--force`).

После пуша на сервере: **если на GitHub был force-push** (`tindermp` перезаписан), обычный `git pull` может ругнуться на *divergent branches* — тогда **один раз**:

```bash
cd /var/www/tindermp
git fetch origin
git reset --hard origin/main
```

Дальше: `pnpm install --frozen-lockfile && pnpm db:migrate:deploy && pnpm build` (или `bash scripts/deploy-pull-build.sh`).

Проверка, что обновилось: `grep db:migrate:deploy package.json` — в корне должен быть **`node packages/db/prisma-with-api-env.cjs`**, не `pnpm --filter`.

## 1) Clone and prepare env

```bash
cd /var/www
git clone https://github.com/alantsoff/tindermp.git tindermp
cd tindermp
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill `apps/api/.env`:
- `DATABASE_URL` (обязательно с параметрами пула, пример: `...?connection_limit=15&pool_timeout=10`; при pgbouncer в transaction mode можно добавить `&pgbouncer=true`)
- `APP_BASE_URL`
- `MATCH_MINIAPP_URL`
- `MATCH_BOT_TOKEN`
- `MATCH_JWT_SECRET`
- `ADMIN_WEB_PASSWORD_HASH` (`node -e "require('bcrypt').hash(process.argv[1], 12).then(v=>console.log(v))" "your_password"`)
- `MATCH_CORS_ORIGINS` (comma-separated origins)
- `MATCH_UPLOADS_DIR` (например, `/var/www/tindermp/apps/api/storage/match-media`)

Fill `apps/web/.env.local`:
- `NEXT_PUBLIC_API_URL` (for browser requests, usually `https://your-domain`)
- `NEXT_INTERNAL_API_URL=http://127.0.0.1:3001`

## 2) First deploy

```bash
chmod +x scripts/deploy-pull-build.sh
pnpm deploy:server
```

Important:
- Do not skip migrations for releases that change Prisma schema.
- Release `eff77db` adds migration `20260421073000_add_match_experience`; API build can succeed while runtime fails if migration is not applied.

## 3) PM2 checks

```bash
pm2 ls
pm2 logs match-api --lines 100
pm2 logs match-web --lines 100
```

## 4) Nginx routes

- `/match-api/*` -> `http://127.0.0.1:3001`
- `/telegram-webhook/match` -> `http://127.0.0.1:3001`
- `/match-media/*` -> `http://127.0.0.1:3001`
- everything else -> `http://127.0.0.1:3100`

Example:

```nginx
server {
    listen 80;
    server_name match.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name match.example.com;

    location /match-api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /telegram-webhook/match {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /match-media/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 5) Telegram bot webhook

Run once after domain is live:

```bash
curl -X POST "https://api.telegram.org/bot${MATCH_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://match.example.com/telegram-webhook/match\"}"
```

## 6) Smoke check

- `GET https://match.example.com/match-api/health` -> `status: ok`
- Open `https://match.example.com/m`
- In bot send `/match`, tap `Открыть Match`
- Complete onboarding -> swipe -> mutual like -> open chat -> send message

## 7) Production runbook (common incidents)

### A) API returns 500 after deploy

1. Check process and logs:
   ```bash
   pm2 ls
   pm2 logs match-api --lines 120
   ```
2. Check env loaded by PM2 process:
   ```bash
   pm2 env match-api | grep -E "DATABASE_URL|MATCH_BOT_TOKEN|MATCH_JWT_SECRET|MATCH_DEV_AUTH_BYPASS"
   ```
3. Verify DB credentials outside Prisma:
   ```bash
   psql "postgresql://<user>:<pass>@127.0.0.1:5432/match_app" -c "select 1;"
   ```

### B) Prisma errors (`P1000`, `P3018`, missing columns)

- `P1000`: wrong DB credentials in `DATABASE_URL` for the running process.
- `P3018 ... must be owner of table`: migration user is not table owner.
- Runtime error about missing `experience` column: code deployed without successful migration.
- `P1012` / `Environment variable not found: DATABASE_URL`: Prisma читает `DATABASE_URL` из процесса. Скрипты `@match/db` вызывают **`packages/db/prisma-with-api-env.cjs`**: он подгружает **`apps/api/.env`** через `dotenv` (без shell/`export` — не ломается фоновый `&`). Файл `apps/api/.env` на сервере обязан существовать и содержать `DATABASE_URL=...` (как у `match-api` в PM2).

Recover (всегда из **корня** репозитория, напр. `/var/www/tindermp`):
```bash
pnpm db:migrate:deploy
pnpm db:generate
```
Корневой `package.json` вызывает `node packages/db/prisma-with-api-env.cjs` (не зависит от `pnpm --filter` и кэша воркспейса). Дубль: `bash scripts/migrate-deploy.sh` из корня.

**Если в логе по-прежнему строка `> prisma migrate deploy` (без `prisma-with-api-env`)** — на сервере **не тот** `packages/db/package.json` (не сделан `git pull` или локальные правки). Проверка: `head -12 packages/db/package.json` — в `db:migrate:deploy` должно начинаться с `node prisma-with-api-env.cjs`. Иначе: `git pull origin main`, при необходимости `git status` / `git diff packages/db`.

### C) Telegram auth fails (`SignatureInvalidError`)

Cause: wrong `MATCH_BOT_TOKEN` for the bot that opens the mini app, or placeholder value.

Fix:
```bash
export MATCH_BOT_TOKEN="<real_bot_token>"
pm2 restart match-api --update-env
```

### D) PM2 uses stale command/env

After changing runtime args/env, recreate processes and save dump:
```bash
pm2 delete match-api || true
pm2 delete match-web || true
pm2 start ecosystem.config.cjs --only match-api --env production
pm2 start ecosystem.config.cjs --only match-web --env production
pm2 save
```

### E) Safety rules for production env

- Never run production with `MATCH_DEV_AUTH_BYPASS=1`.
- Never keep placeholder values like `YOUR_MATCH_BOT_TOKEN`.
- Keep one source of truth for env files used by deploy and PM2.
