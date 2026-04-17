# Match Mini App

## Локальный запуск

1. Запусти API и web:

```bash
pnpm --filter @match/api run dev
pnpm --filter @match/web run dev
```

2. Заполни `apps/api/.env`:
- `DATABASE_URL`
- `MATCH_BOT_TOKEN`
- `MATCH_JWT_SECRET`
- `MATCH_MINIAPP_URL`

3. Для проверки Telegram WebApp используй публичный URL (например через ngrok) и открой `/match` в боте.
