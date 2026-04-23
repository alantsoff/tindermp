# Match API

NestJS backend для Telegram Mini App Match.

## Команды

```bash
pnpm --filter @match/api run dev
pnpm --filter @match/api run build
pnpm --filter @match/api run start
pnpm --filter @match/api run test
pnpm --filter @match/api run lint
```

## Важные env

- `DATABASE_URL`
- `MATCH_JWT_SECRET`
- `MATCH_BOT_TOKEN`
- `MATCH_MINIAPP_URL`
- `ADMIN_EMAILS`
- `ADMIN_WEB_PASSWORD_HASH`
- `MATCH_INVITE_ONLY` — invite-only режим. **По умолчанию включён** (fail-safe): если переменная не задана, регистрация требует инвайт-код. Чтобы открыть публичную регистрацию, задай явно `MATCH_INVITE_ONLY=0`.
- `MATCH_INVITE_BYPASS_USERNAMES` — список Telegram username'ов (через запятую), которые могут регистрироваться без кода.
- `MATCH_CORS_ORIGINS`
- `MATCH_UPLOADS_DIR`

Общий деплой-сценарий: `docs/DEPLOY.md`.
