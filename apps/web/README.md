# Match Web

Next.js клиент для Telegram Mini App `/m` и браузерного админ-интерфейса.

## Команды

```bash
pnpm --filter @match/web run dev
pnpm --filter @match/web run build
pnpm --filter @match/web run start
pnpm --filter @match/web run test
pnpm --filter @match/web run lint
```

## Важные env

- `NEXT_PUBLIC_API_URL`
- `NEXT_INTERNAL_API_URL`
- `NEXT_PUBLIC_TELEGRAM_MINIAPP_LINK`
- `NEXT_PUBLIC_MATCH_DEV_AUTH_BYPASS`

Для production-сервера см. `docs/DEPLOY.md`.
