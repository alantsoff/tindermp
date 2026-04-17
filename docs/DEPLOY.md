# Deploy to VPS (PM2 + Nginx)

## 1) Clone and prepare env

```bash
cd /var/www
git clone <your-repo-url> match-app
cd match-app
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Fill `apps/api/.env`:
- `DATABASE_URL`
- `APP_BASE_URL`
- `MATCH_MINIAPP_URL`
- `MATCH_BOT_TOKEN`
- `MATCH_JWT_SECRET`

Fill `apps/web/.env.local`:
- `NEXT_PUBLIC_API_URL` (for browser requests, usually `https://your-domain`)
- `NEXT_INTERNAL_API_URL=http://127.0.0.1:3001`

## 2) First deploy

```bash
chmod +x scripts/deploy-pull-build.sh
pnpm deploy:server
```

## 3) PM2 checks

```bash
pm2 ls
pm2 logs match-api --lines 100
pm2 logs match-web --lines 100
```

## 4) Nginx routes

- `/match-api/*` -> `http://127.0.0.1:3001`
- `/telegram-webhook/match` -> `http://127.0.0.1:3001`
- everything else -> `http://127.0.0.1:3000`

Example:

```nginx
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

    location / {
        proxy_pass http://127.0.0.1:3000;
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

- `GET https://match.example.com/health` -> `status: ok`
- Open `https://match.example.com/m`
- In bot send `/match`, tap `Открыть Match`
- Complete onboarding -> swipe -> mutual like -> open chat -> send message
