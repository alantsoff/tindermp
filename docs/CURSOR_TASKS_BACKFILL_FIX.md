# Match-app — backfill инвайтов: критичный фикс + прогон

> Задача для Cursor. P0 уже в коде, **не откатывать и не упрощать**. P1 — обязательно выполнить последовательно: сначала DRY_RUN на staging, потом прод. До бэкфилла **не запускать скрипт на прод-БД без DRY_RUN**.

---

## P0 — что уже в коде

### Баг в старой версии скрипта

В `invite.service.ts` сейчас метод `redeemForProfileCreation` пишет в `MatchEventLog` события `type = 'INVITE_REDEEMED'` **для обеих ситуаций**:

- **успех** → `payload: { code }`
- **неуспех** → `payload: { code, reason, status: 'failed' }` (через `logRedeemFailure`, причины: `invalid | revoked | already_used`)

Старая версия `apps/api/scripts/backfill-invite-usage.ts` делала `findMany where type='INVITE_REDEEMED'` **без фильтра по `status`**. Если бы её прогнали, она бы пометила `usedAt` даже для кодов, попытки использования которых были отклонены — то есть **испортила бы БД**: код числился бы «использован», хотя никто его не активировал.

### Что исправлено в `apps/api/scripts/backfill-invite-usage.ts`

1. **Фильтр `payload.status === 'failed'`** — пропускаем все неуспешные попытки redeem.
2. **Фильтр по `revokedAt`** — не воскрешаем отозванные коды.
3. **`DRY_RUN=1`** — запуск без записи в БД, только логирует что собирается сделать.
4. **Breakdown статистика** в итоговом JSON:
   ```json
   {
     "dryRun": true,
     "totalEvents": 123,
     "fixed": 45,
     "alreadyOk": 12,
     "skipped": 66,
     "breakdown": {
       "failedEvents": 52,
       "noInvite": 0,
       "mismatch": 3,
       "noPayload": 11
     }
   }
   ```

**Инвариант:** не возвращать старую версию, где события `type='INVITE_REDEEMED'` обрабатывались без `payload.status` фильтра. Это прямой путь к порче прод-данных.

### Смежные коды — справочно

- `apps/api/src/modules/match/invite.service.ts:redeemForProfileCreation` — три слоя защиты (findUnique → atomic updateMany → P2002 catch)
- `apps/api/src/modules/match/profile.service.ts` — `shouldRedeemInvite = !existingProfile && Boolean(inviteCode)` (не зависит от `MATCH_INVITE_ONLY`)
- Backfill нужен, потому что ДО фикса `605cbb0` код в некоторых конфигурациях env не расходовался, хотя профиль создавался

---

## P1 — прогон (обязательно)

### 1.1 DRY_RUN на staging

```bash
# Сделай свежую копию прод-БД на staging
pg_dump "$PROD_DATABASE_URL" | psql "$STAGING_DATABASE_URL"

# Прогони скрипт БЕЗ записи — только смотрим что он собирается сделать
DATABASE_URL="$STAGING_DATABASE_URL" DRY_RUN=1 \
  pnpm --filter @match/api run backfill:invites \
  | tee backfill-staging-dryrun.log
```

**Что сохранить:** последний JSON-блок из вывода (`{"dryRun": true, ...}`) и список `[dry] event=... code=...` строк.

### 1.2 Разобрать вывод

Посмотри в JSON:

- **`fixed` > 0** — сколько записей скрипт планирует восстановить. Это и есть «легаси-протечка».
- **`breakdown.failedEvents` > 0** — это события отклонённых попыток, которые мы **не** трогаем (именно тот баг, от которого защитились). Если это число большое — значит раньше скрипт испортил бы данные в этом количестве.
- **`breakdown.mismatch` > 0** — предупреждения: код уже привязан к другому профилю, не трогаем. Если таких много — надо расследовать вручную.
- **`breakdown.noInvite` > 0** — событие есть, а кода в БД нет. Обычно означает что код был физически удалён — пропускаем.

### 1.3 Ручная выборочная проверка

Для 2–3 случайных строк `[dry] event=... code=XXXX-YYYY -> profile=<P>` подтверди в БД:

```sql
-- 1. Код сейчас активен в БД?
SELECT code, "usedAt", "usedByProfileId", "revokedAt"
FROM "MatchInviteCode"
WHERE code = 'XXXX-YYYY';

-- 2. Есть ли у этого профиля запись MatchProfile?
SELECT id, "displayName", "createdAt"
FROM "MatchProfile"
WHERE id = '<P>';

-- 3. Самое важное — есть ли ровно одно успешное событие INVITE_REDEEMED
-- для этого кода и профиля?
SELECT id, "createdAt", payload
FROM "MatchEventLog"
WHERE type = 'INVITE_REDEEMED'
  AND "profileId" = '<P>'
  AND payload->>'code' = 'XXXX-YYYY'
  AND (payload->>'status' IS NULL OR payload->>'status' <> 'failed');
```

Если (1) показывает `usedAt IS NULL` и `usedByProfileId IS NULL`, (2) возвращает профиль, (3) возвращает **ровно одну** строку — бэкфилл для этого кейса валиден.

### 1.4 Прогон без DRY_RUN на staging

```bash
DATABASE_URL="$STAGING_DATABASE_URL" \
  pnpm --filter @match/api run backfill:invites \
  | tee backfill-staging-real.log
```

Повтори SQL-запросы из 1.3 — теперь (1) должно показать `usedAt = <timestamp>`, `usedByProfileId = <P>`.

### 1.5 E2E-тест на staging

1. Возьми любой код, который скрипт пометил как `fixed`.
2. С нового Telegram-аккаунта попробуй создать профиль с этим кодом.
3. Ожидание: онбординг редиректит на `/m/invite` с текстом «Этот инвайт-код уже использован».
4. В логах API — строка `invite redeem rejected: code XXXX-YYYY already used by profile=<P>`.

Если 1–4 прошло — переходи к проду.

### 1.6 Прогон на проде

```bash
# Сначала снапшот прод-БД
pg_dump "$PROD_DATABASE_URL" | gzip > "pre-backfill-$(date +%Y%m%d-%H%M%S).sql.gz"

# DRY_RUN на проде — сравниваем числа со staging
DATABASE_URL="$PROD_DATABASE_URL" DRY_RUN=1 \
  pnpm --filter @match/api run backfill:invites \
  | tee backfill-prod-dryrun.log

# Если цифры сошлись со staging — пускаем без DRY_RUN
DATABASE_URL="$PROD_DATABASE_URL" \
  pnpm --filter @match/api run backfill:invites \
  | tee backfill-prod-real.log
```

---

## P2 — если пользователь жалуется после бэкфилла

Если хотя бы один пользователь после прогона скрипта сможет повторно использовать код — запроси от него:

1. **Код**, который «снова работает» — `XXXX-YYYY`.
2. **Telegram username** пользователя, который пытается его использовать.
3. **HTTP-ответ** запроса `POST /match-api/profile` (статус + тело).
4. **Строку из логов API** `invite redeem rejected: ...` (если она была).

И выполни в проде:

```sql
SELECT
  c.code,
  c."usedAt",
  c."usedByProfileId",
  c."revokedAt",
  u.telegramid AS used_by_telegram,
  p.id AS current_user_profile_id
FROM "MatchInviteCode" c
LEFT JOIN "MatchProfile" p1 ON p1.id = c."usedByProfileId"
LEFT JOIN "User" u ON u.id = p1."userId"
LEFT JOIN "User" cu ON cu."telegramId" = '<current_username_telegram_id>'
LEFT JOIN "MatchProfile" p ON p."userId" = cu.id
WHERE c.code = 'XXXX-YYYY';
```

Если `usedAt IS NOT NULL` и пришёл HTTP 409 — **защита работает**, просто пользователь не понял сообщение (UI-проблема, улучшить копирайт на `/m/invite`).

Если `usedAt IS NULL` после бэкфилла — баг на нашей стороне: событие `INVITE_REDEEMED` не было записано / prisma client не подхватил миграцию / скрипт упал тихо. Пришли полный лог `backfill-prod-real.log`.

---

## Чеклист перед прогоном на проде

- [ ] `apps/api/scripts/backfill-invite-usage.ts` содержит фильтр `payload?.status === 'failed'` → continue
- [ ] Там же есть `DRY_RUN` и расширенный breakdown
- [ ] На staging отработал DRY_RUN и выборочная SQL-проверка прошла
- [ ] На staging отработал реальный прогон и E2E (3 аккаунта, 1 код) показал 409 для третьего
- [ ] Снапшот прод-БД сделан и отложен
- [ ] Подготовлен rollback-план: восстановить из снапшота

---

## Что прислать

- `backfill-staging-dryrun.log` (финальный JSON + 3–5 примеров `[dry]`-строк)
- `backfill-staging-real.log` (финальный JSON)
- Результаты SQL-проверки из 1.3 для 2–3 кейсов
- Подтверждение E2E из 1.5 (скриншот `/m/invite` с ошибкой)
- `backfill-prod-dryrun.log` и `backfill-prod-real.log`
- Сравнение `fixed` цифр между staging и prod

---

## Инварианты (не нарушать)

- **Не убирать `payload?.status === 'failed'` фильтр** — это защита данных.
- **Не убирать `DRY_RUN` режим** — нужен для безопасного аудита.
- **Не менять `redeemForProfileCreation`**, чтобы он перестал писать failed-события в `MatchEventLog`. Эти события нужны для админской аналитики (подборщики кодов).
- **Не запускать скрипт на проде без предварительного DRY_RUN и снапшота БД.**
