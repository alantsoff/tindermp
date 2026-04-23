# Match-app — финальный аудит инвайт-кодов

> Задача для Cursor. Я прошёлся по коду полностью, ментально протыкал 7 сценариев, нашёл один UX-edge-case и поправил. P0 уже в коде — **не откатывать**. P1 — добавить покрытие и задеплоить.

---

## P0 — что уже в коде (не откатывать)

### Idempotency-фикс в `redeemForProfileCreation`

**Файл:** `apps/api/src/modules/match/invite.service.ts`

Добавлена проверка **перед** общим throw на `usedAt || usedByProfileId`:

```ts
// Idempotency: если код уже принадлежит этому же профилю — это retry
// того же запроса (например, клиент перепослал из-за сетевого таймаута).
// Возвращаем без ошибки, чтобы не ломать повторный upsertProfile.
if (existing.usedByProfileId === newProfileId) {
  this.logger.log(
    `invite redeem idempotent: code ${code} already claimed by ${newProfileId}`,
  );
  return;
}
```

**Зачем:** защищает от «ложного 409» в таком сценарии:

1. B нажал submit в онбординге → POST висит на таймауте → клиент перепослал (или F5).
2. Первый запрос всё-таки закоммитил: `B.profile` создан, код помечен `usedByProfileId = B.profile.id`.
3. Второй запрос ещё читает `existingProfile = null` (race). Упсерт делает UPDATE существующего `B.profile`.
4. Redeem: `existing.usedByProfileId === B.profile.id` → **idempotent return**, не 409.

Защита от использования **другими** профилями остаётся ниже в том же блоке (`usedAt || usedByProfileId`).

### Всё остальное — как и было

- Три слоя защиты: early-return `findUnique` → атомарный `updateMany` → P2002 catch.
- `profile.service.ts`: `shouldRedeemInvite = !existingProfile && Boolean(inviteCode)` — код расходуется всегда при создании нового профиля с переданным кодом.
- Единственная точка записи `usedAt` — `invite.service.ts:161` (через `updateMany`).
- Единственный вызов redeem — `profile.service.ts:321`.

**Инвариант:** не возвращайся к варианту, где idempotency-проверка **после** throw — иначе retry-сценарий снова начнёт отдавать ложные 409.

---

## P1 — добавить тест на idempotency

**Файл:** `apps/api/src/modules/match/invite.service.spec.ts` (уже существует, дополнить)

Добавь третий тест-кейс:

```ts
it('is idempotent when the same profile claims the code twice', async () => {
  const { service, tx } = buildService();
  tx.matchInviteCode.findUnique.mockResolvedValue({
    id: 'i1',
    usedAt: new Date(),
    revokedAt: null,
    usedByProfileId: 'same-profile',  // ← тот же, что и newProfileId
  });

  // Не должно бросать и не должно вызывать updateMany
  await expect(
    service.redeemForProfileCreation(tx, 'ABCD-EFGH', 'same-profile'),
  ).resolves.toBeUndefined();
  expect(tx.matchInviteCode.updateMany).not.toHaveBeenCalled();
});
```

Проверь, что существующие два теста (`throws when already claimed by other` и `throws when race lost`) по-прежнему проходят — они не должны ломаться от idempotency-ветки.

---

## P2 — задеплоить и проверить

### 2.1 Убедиться, что main актуальный

```bash
git log -1 --format='%H %s' -- apps/api/src/modules/match/invite.service.ts
```

Последний коммит в этом файле должен содержать idempotency-проверку. Если нет — запушь.

### 2.2 Прогнать на проде

```bash
ssh <prod-host>
cd /var/www/match-app
pnpm deploy:server
pm2 ls                   # статус
pm2 logs match-api --lines 50 --nostream
```

В логах API после рестарта должна быть строка `Nest microservice successfully started` и никаких ошибок Prisma (signature `Environment variables loaded from apps/api/.env`).

### 2.3 E2E-проверка через 3 телеграм-аккаунта

1. Войди админом, выпусти код `TEST-1234` у тестового профиля A (через `/match-api/admin/invites/issue-to-profile` или `/m/profile → копировать`).
2. Второй аккаунт B: miniapp → `/m/invite` → вводит `TEST-1234` → проходит онбординг. Должен попасть на `/m/feed`.
3. В `/m/profile` у A: через 30s (staleTime) → этот код показывается как **«использован»** с именем B.
4. Третий аккаунт C: miniapp → `/m/invite` → вводит `TEST-1234` → кликает «Продолжить». Должен получить редирект на `/m/invite` с ошибкой «Этот инвайт-код уже использован. Попросите новый у знакомого».
5. В логах API должна быть строка:
   ```
   invite redeem rejected: code TEST-1234 already used by profile=<B.id> (attempted by profile=<C.id>)
   ```
6. В БД:
   ```sql
   SELECT code, "usedAt", "usedByProfileId", "revokedAt"
   FROM "MatchInviteCode" WHERE code = 'TEST-1234';
   ```
   Должно быть: `usedAt != null`, `usedByProfileId = B.id`, `revokedAt = null`.

### 2.4 Idempotency-сценарий

На staging-сервере:

1. Через curl/тестовый аккаунт B без профиля делаем два **почти одновременных** POST `/match-api/profile` с кодом `TEST-5678`:
   ```bash
   (curl -s -X POST ... -d '{"inviteCode":"TEST-5678",...}' &
    curl -s -X POST ... -d '{"inviteCode":"TEST-5678",...}' &
    wait)
   ```
2. Ожидание: один из запросов возвращает 200/201 (создал профиль), **второй тоже 200/201** (не 409), потому что idempotency-проверка сработала.
3. В логах: `invite redeem idempotent: code TEST-5678 already claimed by <B.id>`.
4. В БД: B.profile существует один, код помечен за B один раз, `count` в `MatchInviteCode` не двоится.

Если второй запрос вернул 409 — значит idempotency не задеплоилась. Проверь `git rev-parse HEAD` на проде, должен совпадать с main.

---

## P3 — если жалоба повторится после P1+P2

Запроси от жалующегося пользователя:

1. Telegram username + скрин экрана, где у него «получилось повторно войти».
2. Сам код `XXXX-YYYY`.

И выполни в проде:

```sql
-- Посмотреть текущее состояние кода
SELECT code, "usedAt", "usedByProfileId", "revokedAt", "createdAt"
FROM "MatchInviteCode" WHERE code = 'XXXX-YYYY';

-- Все события по этому коду
SELECT id, "profileId", "createdAt", payload
FROM "MatchEventLog"
WHERE payload->>'code' = 'XXXX-YYYY'
ORDER BY "createdAt";

-- Профили, которые могли использовать этот код
SELECT p.id, p."displayName", p."createdAt", u."telegramId", u."telegramUsername"
FROM "MatchProfile" p
JOIN "User" u ON u.id = p."userId"
WHERE p.id IN (
  SELECT "usedByProfileId" FROM "MatchInviteCode" WHERE code = 'XXXX-YYYY'
  UNION
  SELECT "profileId" FROM "MatchEventLog"
  WHERE payload->>'code' = 'XXXX-YYYY' AND "profileId" IS NOT NULL
);
```

Если `usedAt IS NULL` и есть несколько успешных `INVITE_REDEEMED` событий — это баг, пришли мне вывод. Вероятно legacy из до-фикса, тогда прогнать `backfill-invite-usage.ts` из `CURSOR_TASKS_BACKFILL_FIX.md`.

Если `usedAt` проставлен, но пользователь всё равно «зашёл повторно» — значит **это тот же самый Telegram-аккаунт**, который ранее создал профиль. Он не «заходит повторно по коду», он редактирует существующий профиль (в онбординге), и клиент передаёт inviteCode из sessionStorage. Redeem в этом случае не вызывается (`shouldRedeemInvite = false`, т.к. `existingProfile !== null`). Это **корректное поведение** — пользователь уже зарегистрирован.

UX-подсказка: если запрос от `existingProfile` пришёл с `inviteCode` в DTO — в `profile.service.ts` можно залогировать этот факт и очистить поле на клиенте. Но это не баг безопасности.

---

## Чеклист перед коммитом

```bash
cd apps/api
pnpm exec tsc --noEmit -p tsconfig.json
pnpm run lint
pnpm run test            # должен пройти новый тест из P1
```

Все зелёные → git add + push.

---

## Что прислать

1. Вывод `pnpm --filter @match/api run test` с новым passing-тестом `is idempotent when the same profile claims the code twice`.
2. Лог API с тестового прогона шага 2.4 со строкой `invite redeem idempotent: ...`.
3. Скриншот БД после шага 2.3.6 (состояние кода после третьей попытки — `usedAt != null`, `usedByProfileId = B.id`).
4. Подтверждение, что третий аккаунт C в шаге 2.3.4 корректно получил ошибку.

---

## Инварианты (не нарушать)

- Idempotency-проверка должна идти **до** общего throw на `usedAt || usedByProfileId`. Не переставлять местами.
- Не превращать idempotency в «возвращать OK для любого владельца» — только когда `existing.usedByProfileId === newProfileId`.
- Не снимать `usedByProfileId @unique` со схемы — это последний рубеж защиты.
