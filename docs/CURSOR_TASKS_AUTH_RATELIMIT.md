# Match-app — hardening сессия (auth, инвайты, admin, UX, обходы)

> Задача для Cursor. В локальной ветке лежат все P0-правки — **не откатывать**. Нужно: доустановить `@nestjs/throttler`, прогнать типы/тесты, закоммитить, запушить и задеплоить. Все шаги в этом документе.

---

## Что чинили и почему

1. **`initData` TTL был 24 часа** — окно переиспользования при утечке = сутки. Telegram рекомендует ≤ 5 минут.
2. **Нет rate-limit на `/match-api/auth` и `/match-api/profile`.** `/profile` — точка редима инвайта, перебор ничем не ограничен.
3. **Энтропия инвайт-кода 32⁸ ≈ 1.1 × 10¹².** При отсутствии rate-limit недостаточно.
4. **Фронт падал с абстрактным «Mini App нужно открыть из Telegram»** даже когда initData просто не успела проинжектиться или истекла после долгого онбординга.
5. **Invite-only был fail-open.** На проде `MATCH_INVITE_ONLY` не задана → регистрации шли без инвайта. Это главная причина жалобы «проходят без инвайта».
6. **Admin `/match-admin/users` падал 500** на любом невалидном значении `role`/`workFormat`/`marketplace` — Prisma-enum, а в UI стоял свободный `<input>`.
7. **Dev-bypass создавал профиль в prod** при включённом `MATCH_DEV_AUTH_BYPASS_IN_PRODUCTION=1`, минуя invite-only. Штатные bypass'ы (admins / usernames) работали молча, без аудита.

---

## P0 — что уже в коде (не откатывать)

### 0.1 TTL initData: 24h → 15 минут

`apps/api/src/modules/match/match-auth.service.ts:268`

```ts
validate(initData, this.getMatchBotToken(), { expiresIn: 900 });
```

### 0.2 Глобальный `ThrottlerGuard` + жёсткие лимиты

- `apps/api/package.json` — `"@nestjs/throttler": "^6.4.0"`
- `apps/api/src/app.module.ts` — `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])` + `APP_GUARD → ThrottlerGuard`
- `apps/api/src/modules/match/match.controller.ts`:

```ts
@Post('auth')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
auth(@Body() dto: AuthInitDto) { ... }

@Post('profile')
@UseGuards(MatchAuthGuard)
@Throttle({ default: { ttl: 60_000, limit: 5 } })
upsertProfile(...) { ... }
```

### 0.3 Инвайт-код: 32⁸ → 32¹⁰ (формат `XXXXX-XXXXX`)

`apps/api/src/modules/match/match.utils.ts` — `INVITE_CODE_LENGTH = 10`. Старые `XXXX-XXXX` остаются валидными.

### 0.4 Фронт принимает оба формата

`apps/web/app/m/_components/MatchInviteClient.tsx` — `VALID_CODE_LENGTHS = new Set([9, 11])`, плейсхолдер `XXXXX-XXXXX`.

### 0.5 Ретрай ожидания `initData` + разделение UX-ошибок

- `apps/web/app/m/_lib/telegram.ts` — `waitForInitData(timeoutMs)`, `hasTelegramWebApp()`
- `apps/web/app/m/_lib/api.ts` — `MatchAuthError` с кодами `AUTH_ERROR_NO_TELEGRAM` / `AUTH_ERROR_INIT_DATA_LOST`
- `apps/web/app/m/_components/MatchBootstrap.tsx` — разные UI-сообщения, кнопка «Перезагрузить» для `INIT_DATA_LOST`

### 0.6 Invite-only fail-safe дефолт

`apps/api/src/modules/match/match.utils.ts` — новый helper:

```ts
export function isInviteOnlyModeEnabled(): boolean {
  const raw = process.env.MATCH_INVITE_ONLY?.trim().toLowerCase();
  if (raw === undefined || raw === '') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }
  return true;
}
```

`profile.service.ts` и `match-maintenance.service.ts` используют его. `.env.example` + README описывают новое поведение.

### 0.7 Валидация enum-фильтров в admin `/users`

- `apps/api/src/modules/match-admin/match-admin.service.ts` — `coerceEnum()` по white-list'у Prisma-enum'ов; невалид **игнорируется** (не падаем 500) + `Logger.warn`.
- `apps/api/src/modules/match-admin/match-admin.controller.ts` — убран `as never`.
- `apps/web/app/admin/match/users/page.tsx` — свободный `<input>` заменён на `<select>` с опциями из `MATCH_ROLES`.

### 0.8 Ликвидация обходов invite-only

**Обход через dev-bypass в prod закрыт.** `apps/api/src/modules/match/match-auth.service.ts` — в `authenticateLocalDev` при `NODE_ENV=production` теперь **не создаётся `MatchProfile`** даже если `MATCH_DEV_AUTH_BYPASS_IN_PRODUCTION=1`. Юзер получает токен с `profileId=null` и проходит обычный invite-flow. Критическая запись в логе:
```
dev-bypass auth used in production for telegramId=... — profile creation skipped
```

**Аудит штатных bypass'ов.** `apps/api/src/modules/match/profile.service.ts` — когда админ (`ADMIN_EMAILS`) или bypass-username (`MATCH_INVITE_BYPASS_USERNAMES`) создаёт профиль без кода, пишется `Logger.warn`:
```
invite bypass on profile creation: userId=... telegramId=... username=... reason=admin|username_bypass
```

**Startup-диагностика.** `apps/api/src/main.ts` — при `bootstrap()` API пишет текущий режим:
```
NODE_ENV=production invite-only=ON dev-bypass=off dev-bypass-in-prod=off admins=2 bypass-usernames=1
```
Плюс `Logger.error` если в prod включён `MATCH_DEV_AUTH_BYPASS`, и `Logger.warn` если invite-only выключен в prod. Оператор сразу видит аномалию в `pm2 logs match-api`.

**Тесты на все пути.** `apps/api/src/modules/match/invite-enforcement.spec.ts` — **15** `it()` (в т.ч. bypass-username + код, два сценария апдейта профиля). Покрытие: без кода / невалид / revoked / used / валид / нормализация / admin + username bypass / апдейт existing / идемпотентность / fail-safe / invite-only OFF.

---

## P1 — install и прогон

```bash
cd /path/to/match-app
pnpm install                                    # подтянет @nestjs/throttler

cd apps/api
pnpm exec tsc --noEmit -p tsconfig.json         # 0 ошибок
pnpm run lint
pnpm run test                                   # должен пройти invite-enforcement.spec + invite.service.spec

cd ../web
pnpm exec tsc --noEmit -p tsconfig.json         # 0 ошибок
pnpm run lint
```

До `pnpm install` tsc по api падает на импортах `@nestjs/throttler` — после установки должны пропасть.

---

## P2 — git flow

### 2.1 Проверить, что ветка чистая от нерелевантного мусора

```bash
cd /path/to/match-app
git status
git diff --stat
```

Все изменённые файлы должны быть из списка ниже. Если есть что-то ещё — сначала разобраться, не коммитить вслепую.

### 2.2 Добавить файлы

```bash
git add apps/api/package.json \
        apps/api/.env.example \
        apps/api/README.md \
        apps/api/src/main.ts \
        apps/api/src/app.module.ts \
        apps/api/src/modules/match/match.controller.ts \
        apps/api/src/modules/match/match-auth.service.ts \
        apps/api/src/modules/match/match.utils.ts \
        apps/api/src/modules/match/match-maintenance.service.ts \
        apps/api/src/modules/match/profile.service.ts \
        apps/api/src/modules/match/invite-enforcement.spec.ts \
        apps/api/src/modules/match-admin/match-admin.controller.ts \
        apps/api/src/modules/match-admin/match-admin.service.ts \
        apps/web/app/m/_lib/api.ts \
        apps/web/app/m/_lib/telegram.ts \
        apps/web/app/m/_components/MatchBootstrap.tsx \
        apps/web/app/m/_components/MatchInviteClient.tsx \
        apps/web/app/admin/match/users/page.tsx \
        docs/CURSOR_TASKS_AUTH_RATELIMIT.md
```

Убедись, что в `git status` не осталось других изменённых файлов по этой теме (pnpm-lock.yaml точно должен обновиться после `pnpm install` — его тоже добавь).

```bash
git add pnpm-lock.yaml
```

### 2.3 Коммит и push

Вариант A — один коммит (рекомендую, все изменения логически связаны):

```bash
git commit -m "security: invite-only fail-safe, rate-limit, initData TTL 15m, admin enum validation, bypass audit

- match-auth.service: initData TTL 24h -> 15m; dev-bypass no longer creates MatchProfile in production
- match.controller + app.module: @nestjs/throttler with per-route limits (auth: 10/min, profile: 5/min)
- match.utils: isInviteOnlyModeEnabled() fail-safe default (missing env = ON); invite code 10 chars (32^10 entropy)
- profile.service + match-maintenance.service: use shared isInviteOnlyModeEnabled(); warn log on admin/username bypass
- match-admin.service: coerceEnum() for role/workFormat/marketplace; no more 500 on invalid filter values
- admin users UI: <input role> replaced with <select> from MATCH_ROLES
- web: waitForInitData() retry + MatchAuthError with NO_TELEGRAM / INIT_DATA_LOST codes; reload button in bootstrap
- main.ts: startup log of invite-only / dev-bypass / admins / bypass-usernames
- tests: invite-enforcement.spec (15 cases) covering all enforcement paths
"
```

Вариант B — отдельные коммиты по слоям (если политика репо требует атомарности):

```bash
# 1. Бэк: auth + rate-limit + invite code
git add apps/api/package.json \
        apps/api/src/app.module.ts \
        apps/api/src/modules/match/match.controller.ts \
        apps/api/src/modules/match/match-auth.service.ts \
        apps/api/src/modules/match/match.utils.ts \
        pnpm-lock.yaml
git commit -m "security: initData TTL 15m, rate-limit via throttler, invite code 32^10 entropy"

# 2. Invite-only fail-safe
git add apps/api/src/modules/match/profile.service.ts \
        apps/api/src/modules/match/match-maintenance.service.ts \
        apps/api/.env.example \
        apps/api/README.md
git commit -m "security: invite-only fail-safe default + bypass audit log"

# 3. Dev-bypass fix + startup log
git add apps/api/src/main.ts \
        apps/api/src/modules/match/match-auth.service.ts
git commit -m "security: dev-bypass cannot create profiles in production; startup diagnostics"

# 4. Admin enum validation
git add apps/api/src/modules/match-admin/match-admin.controller.ts \
        apps/api/src/modules/match-admin/match-admin.service.ts \
        apps/web/app/admin/match/users/page.tsx
git commit -m "fix(admin): validate role/workFormat/marketplace enum filters; replace free input with select"

# 5. Web UX
git add apps/web/app/m/_lib/api.ts \
        apps/web/app/m/_lib/telegram.ts \
        apps/web/app/m/_components/MatchBootstrap.tsx \
        apps/web/app/m/_components/MatchInviteClient.tsx
git commit -m "ux: waitForInitData retry + distinct auth error messages with reload button"

# 6. Тесты
git add apps/api/src/modules/match/invite-enforcement.spec.ts
git commit -m "tests: invite enforcement — 15 cases covering bypass and redeem paths"

# 7. Документация
git add docs/CURSOR_TASKS_AUTH_RATELIMIT.md
git commit -m "docs: cursor task for hardening session"
```

### 2.4 Feature-branch (если политика требует)

```bash
git switch -c hardening/invite-only-rate-limit-ux 2>/dev/null || git switch hardening/invite-only-rate-limit-ux
git push -u origin hardening/invite-only-rate-limit-ux
```

Затем открыть PR в main на GitHub/GitLab, self-review, merge.

Если работаем напрямую в main (один разработчик):

```bash
git push origin main
```

---

## P3 — хот-фикс на проде до деплоя нового кода

На прод-сервере `/var/www/tindermp/apps/api/.env` переменной `MATCH_INVITE_ONLY` нет → старый код пускает всех без инвайта. Закрываем это прямо сейчас, не дожидаясь rebuild'а:

```bash
ssh root@7022995-ta305874
cd /var/www/tindermp

# Добавить переменную, если её нет
grep -q '^MATCH_INVITE_ONLY=' apps/api/.env \
  || echo 'MATCH_INVITE_ONLY=1' >> apps/api/.env

# Подтвердить
grep MATCH_INVITE_ONLY apps/api/.env

# Рестарт
pm2 restart match-api
pm2 logs match-api --lines 30 --nostream
```

Смоук (токен обычного юзера, не админ, не bypass):

```bash
curl -s -w '\n%{http_code}\n' \
  -X POST http://127.0.0.1:3001/match-api/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"role":"SELLER","displayName":"Test"}'
# Ожидание: {"code":"invite_required"} + HTTP 400
```

После деплоя нового кода (см. P4) переменная станет необязательной — но лучше оставить её для явности.

---

## P4 — полный деплой нового кода

```bash
ssh root@7022995-ta305874
cd /var/www/tindermp

git pull
pnpm install --frozen-lockfile
pnpm --filter @match/api run build
pnpm --filter @match/web run build

pm2 restart match-api match-web
pm2 logs match-api --lines 60 --nostream
```

В логах после рестарта ищи строку `Bootstrap` — должна быть похожа на:
```
[Bootstrap] NODE_ENV=production invite-only=ON dev-bypass=off dev-bypass-in-prod=off admins=2 bypass-usernames=1
```

Если видишь `invite-only=OFF`, `dev-bypass=ON` или ERROR-строку — **не отдавай трафик**, разбирайся с env до того как пустить пользователей.

---

## P5 — post-deploy верификация

### 5.1 Invite-only реально включён

```bash
curl -s -w '\n%{http_code}\n' \
  -X POST https://match.example.com/match-api/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"role":"SELLER","displayName":"Test"}'
# {"code":"invite_required"} HTTP 400
```

### 5.2 TTL initData = 15 минут

Скопировать initData из DevTools, подождать 16 минут, `POST /match-api/auth` → `401 Telegram initData has expired`.

### 5.3 Rate-limit на /profile

```bash
for i in 1 2 3 4 5 6; do
  curl -s -w "\n%{http_code}\n" \
    -X POST https://match.example.com/match-api/profile \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"inviteCode\":\"TEST$i-AAAAA\",\"role\":\"SELLER\",\"displayName\":\"X\"}"
done
# 1-5: 400 invite_invalid, 6-я: 429
```

### 5.4 Новая длина кодов в БД

```sql
SELECT code, LENGTH(code) AS len, "createdAt"
FROM "MatchInviteCode"
WHERE "createdAt" > now() - interval '1 hour'
ORDER BY "createdAt" DESC LIMIT 20;
```
Новые коды `len = 11`. Старые `len = 9` остаются валидными.

### 5.5 Admin фильтр не падает

1. `/admin/match/users` → дропдаун «Роль: все» с опциями из `MATCH_ROLES`.
2. Подменить в URL `?role=foo` → страница открывается, в `pm2 logs match-api` строка `admin users filter: invalid role "foo" — ignored`.

### 5.6 UX мини-аппа

- Из браузера → «Запуск не из Telegram», без кнопки reload.
- Из Telegram после 16 минут простоя → «Сессия Telegram истекла» + кнопка «Перезагрузить» → после клика вход проходит.

### 5.7 Bypass audit работает

Авторизуйся как admin / bypass-username и создай профиль без кода. В логах появится:
```
[ProfileService] invite bypass on profile creation: userId=... reason=admin
```

---

## Что прислать после выполнения

1. Хеш коммита(ов) или ссылка на PR.
2. Вывод `pnpm --filter @match/api run test` с зелёным `invite-enforcement.spec.ts` (15 кейсов) и `invite.service.spec.ts` (3 кейса).
3. Результат smoke P3 (invite_required до и после хот-фикса env).
4. Строка `[Bootstrap]` из `pm2 logs` после P4.
5. Результат smoke P5.3 (6-й ответ = 429).
6. SQL-вывод P5.4 (несколько кодов `len = 11`).
7. Скриншоты P5.6 (две разные UX-ошибки).

---

## Полный список изменённых/новых файлов

```
apps/api/package.json
apps/api/.env.example
apps/api/README.md
apps/api/src/main.ts
apps/api/src/app.module.ts
apps/api/src/modules/match/match.controller.ts
apps/api/src/modules/match/match-auth.service.ts
apps/api/src/modules/match/match.utils.ts
apps/api/src/modules/match/match-maintenance.service.ts
apps/api/src/modules/match/profile.service.ts
apps/api/src/modules/match/invite-enforcement.spec.ts          [NEW]
apps/api/src/modules/match-admin/match-admin.controller.ts
apps/api/src/modules/match-admin/match-admin.service.ts
apps/web/app/m/_lib/api.ts
apps/web/app/m/_lib/telegram.ts
apps/web/app/m/_components/MatchBootstrap.tsx
apps/web/app/m/_components/MatchInviteClient.tsx
apps/web/app/admin/match/users/page.tsx
docs/CURSOR_TASKS_AUTH_RATELIMIT.md
pnpm-lock.yaml                                                  [после pnpm install]
```

---

## Инварианты (не ломать в будущем)

- `expiresIn` в `validate(initData, ...)` ≤ 900.
- `@Throttle` на `/auth` (10/мин) и `/profile` (5/мин) + глобальный `ThrottlerGuard` — обязательны.
- `INVITE_CODE_LENGTH` чётное и ≥ 10. `VALID_CODE_LENGTHS` на фронте = `{9, 11}` пока в БД есть активные 4-4 коды.
- `waitForInitData` — единственная точка ожидания initData.
- `MatchAuthError` с двумя кодами — не сливать.
- `isInviteOnlyModeEnabled()` — fail-safe: отсутствие env = ON.
- `authenticateLocalDev` в prod **не создаёт MatchProfile** даже при `MATCH_DEV_AUTH_BYPASS_IN_PRODUCTION=1`.
- Любое query-поле-enum в admin → через `coerceEnum`. Никаких `as never` в контроллерах.
- Штатные bypass'ы (admin / username) — **обязательно** логируются `Logger.warn`.
- `main.ts` bootstrap — пишет стартовый Bootstrap-лог режима.
