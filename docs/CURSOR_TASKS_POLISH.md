# Match-app — polish: multi-select «О себе» + аудит одноразовости инвайтов

> Задача для Cursor. P0-блок уже в коде — проверь, не трогай. P1 — обязательные шаги по проверке и бэкфиллу инвайтов. Дальше — полировка.

---

## P0 — что уже в коде (не откатывать)

### Multi-select пресетов в онбординге

**Файл:** `apps/web/app/m/onboarding/page.tsx`

- State переименован: `purposePreset: string` → `purposePresets: string[]`. Пресеты теперь массив, Chip работает как multi-select (тот же паттерн, что Marketplaces / workFormats).
- Hydration существующего профиля разбирает headline по паттерну `"Preset1 · Preset2 — свободный текст"`:
  - разделитель между пресетами — `' · '`
  - разделитель между presets-частью и свободным текстом — `' — '`
  - если ВСЕ части presets-часть совпадают с `PURPOSE_PRESETS` — восстанавливаем массив + остаток в `purposeText`; иначе весь headline идёт в `purposeText`.
- `onSubmit` собирает:
  ```ts
  const presetsJoined = purposePresets.join(' · ');
  const purposeParts = [presetsJoined, purposeText.trim()].filter(Boolean);
  const headline = purposeParts.join(' — ').slice(0, 120);
  ```
- Section «О себе» получил `description="Можно выбрать несколько — например «Найти команду» и «Нетворкинг»."`.

**Инвариант:** не возвращай single-select. Длинные комбинации обрезаются на 120 символов (DTO-лимит) — это допустимое поведение, предупреждать пользователя не нужно.

### Аудит одноразовости инвайтов — результат

Я прошёлся по всем путям. На текущем срезе кода **коды одноразовы** — защита есть в трёх слоях:

1. `MatchInviteCode.usedByProfileId @unique` в `schema.prisma` — БД не даст двум профилям claim один код.
2. `invite.service.ts:redeemForProfileCreation`:
   - `findUnique` + early-return на `usedAt || revokedAt || usedByProfileId`
   - атомарный `updateMany WHERE { id, usedAt: null, revokedAt: null, usedByProfileId: null }`
   - P2002 catch → `ConflictException('invite_already_used')`
3. `profile.service.ts:upsertProfile` вызывает redeem только внутри `$transaction` при `shouldRedeemInvite = !existingProfile && Boolean(inviteCode)` — то есть **всегда при создании нового профиля**, независимо от `MATCH_INVITE_ONLY`.

**Единственное место записи `usedAt/usedByProfileId`** — `invite.service.ts:131`. Я это подтвердил grep'ом: других писателей нет.

Остаётся **только легаси-риск**: коды, вводившиеся ДО фикса (когда redeem срабатывал только при `MATCH_INVITE_ONLY=1`) могли остаться с `usedAt=null`, хотя профиль создался. Эти старые записи сейчас числятся активными. Решение — backfill-скрипт из P1.

---

## P1 — обязательное: накатить backfill на прод

### 1.1 Убедиться, что скрипт существует

Если ещё не создавал, возьми готовый код из [`docs/CURSOR_TASKS_INVITES.md`](./CURSOR_TASKS_INVITES.md) раздел P1.1 — `apps/api/scripts/backfill-invite-usage.ts`. И npm-скрипт `"backfill:invites"` в `apps/api/package.json`.

### 1.2 Прогнать на копии прод-БД (staging)

```bash
# 1) сделать дамп прод-БД и развернуть на staging
pg_dump $PROD_DATABASE_URL | psql $STAGING_DATABASE_URL

# 2) на staging прогнать скрипт
DATABASE_URL=$STAGING_DATABASE_URL pnpm --filter @match/api run backfill:invites
```

Сохранить JSON-вывод (`{ totalEvents, fixed, alreadyOk, skipped }`). Если `skipped` > 10% от `totalEvents` — разобраться, почему (скорее всего, профили приглашённых были удалены — тогда это ожидаемо).

### 1.3 Проверить запросом в staging-БД

```sql
-- сколько «активных» инвайт-кодов до бэкфилла было, должно уменьшиться
SELECT
  COUNT(*) FILTER (WHERE "usedAt" IS NULL AND "revokedAt" IS NULL) AS active,
  COUNT(*) FILTER (WHERE "usedAt" IS NOT NULL) AS used,
  COUNT(*) FILTER (WHERE "revokedAt" IS NOT NULL) AS revoked
FROM "MatchInviteCode";

-- убедиться, что ни один код не privязан к двум usedByProfileId
-- (этого и не может быть — @unique, но на всякий случай)
SELECT "usedByProfileId", COUNT(*)
FROM "MatchInviteCode"
WHERE "usedByProfileId" IS NOT NULL
GROUP BY "usedByProfileId"
HAVING COUNT(*) > 1;
```

Второй запрос должен вернуть 0 строк. Первый — увидеть, что `active` уменьшилось.

### 1.4 Прогнать на проде

Когда staging отработал, запустить на продовой БД (в maintenance-окне, заранее сделать снапшот):

```bash
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @match/api run backfill:invites
```

Приложить JSON-вывод к PR / Slack.

### 1.5 E2E-проверка после бэкфилла

Сценарий (подтверждают одноразовость):

1. Войди как админ, выпусти новый код `AAAA-BBBB` у тестового профиля A.
2. Второй Telegram-аккаунт B: открой mini-app, введи `AAAA-BBBB`, дойди до конца онбординга → профиль создан. В `/m/profile` у A код должен быть помечен «использован», активировал B.
3. Третий аккаунт C: введи тот же `AAAA-BBBB`. Ожидание: онбординг редиректит на `/m/invite` с сообщением «Этот инвайт-код уже использован. Попросите новый у знакомого».
4. Проверь в логах API: должна быть строка `invite redeem rejected: code AAAA-BBBB already used by profile=<B> (attempted by profile=<C>)`.

Если шаг 3 не блокируется — немедленно откати деплой и пришли мне стэктрейс + payload запроса.

---

## P2 — UX для владельца кода (desync списка)

`useInvites` в `apps/web/app/m/_lib/queries.ts` сейчас не обновляется автоматически — владелец увидит код как «активен» ещё долго после того, как его списали. Добавь мягкий refetch:

```ts
export function useInvites() {
  return useQuery({
    queryKey: matchKeys.invites,
    queryFn: () => matchApi.invites(),
    retry: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 30_000,
  });
}
```

Не делай `refetchInterval` — зачем лишний трафик, хватит refocus + mount.

---

## P3 — telemetry

В `apps/api/src/modules/match/invite.service.ts:redeemForProfileCreation` сейчас логи через `Logger.warn`. Для продовой видимости добавь также запись в `MatchEventLog`:

```ts
// после каждого throw (invite_invalid / invite_revoked / invite_already_used)
void this.eventLogger.log({
  profileId: newProfileId,
  type: 'INVITE_REDEEMED', // или введи новый INVITE_REDEEM_FAILED, если добавишь в enum
  payload: {
    code,
    reason: 'already_used', // invalid / revoked / already_used
    attemptedBy: newProfileId,
  },
});
```

Если решишь завести новый enum-вариант `INVITE_REDEEM_FAILED` — заодно сделать Prisma-миграцию.

Это нужно, чтобы админка могла показать «попытки использовать уже занятые коды» за последние N дней и увидеть подборщиков.

---

## P4 — тест на multi-select hydration

**Файл:** `apps/web/app/m/onboarding/page.test.tsx` (новый, Vitest)

Покрыть:

1. `headline = "Найти команду · Нетворкинг — Коротко о себе"` → `purposePresets === ['Найти команду', 'Нетворкинг']`, `purposeText === 'Коротко о себе'`
2. `headline = "Найти команду"` → `purposePresets === ['Найти команду']`, `purposeText === ''`
3. `headline = "Случайный текст без пресета"` → `purposePresets === []`, `purposeText === "Случайный текст без пресета"`
4. `headline = "Найти команду · NeuralPrompt — bla"` — второй элемент не в `PURPOSE_PRESETS` → всё идёт в `purposeText`, пресеты пустые.

Если тянуть тест всего компонента дорого — вынеси парсинг в чистую функцию `parseHeadlineToPurposeParts(headline, presets)` в `../_lib/purpose.ts` и тестируй её изолированно.

---

## Чеклист перед коммитом

```bash
cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json
cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json
cd apps/web && pnpm exec eslint 'app/**/*.{ts,tsx}'
cd apps/api && pnpm run test
cd apps/web && pnpm run test
```

И обязательно — ручная проверка P1.5 на staging. Без неё не пускать в прод.

---

## Что прислать, когда закончишь

1. JSON-вывод `backfill:invites` со staging и с прода.
2. Скриншоты:
   - `/m/profile → 🎟 Приглашения` с пометкой «использован» у кода, который раньше был активен.
   - `/m/onboarding` с 2–3 выбранными пресетами «О себе» и свободным текстом под ними.
3. Лог-выдержку из API при попытке ввести уже использованный код (строка `invite redeem rejected: ...`).
4. Подтверждение, что шаги 1–4 из P1.5 прошли как ожидается.
