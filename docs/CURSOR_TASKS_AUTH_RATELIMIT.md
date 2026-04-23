# Match-app — hardening сессия (auth, инвайты, admin, UX)

> Задача для Cursor. В локальной ветке лежат все P0-правки — **не откатывать**. Нужно: доустановить `@nestjs/throttler`, прогнать типы/тесты, добавить юнит-тесты, закоммитить, запушить и задеплоить. Все шаги в этом документе.

---

## Что чинили и почему

1. **`initData` TTL был 24 часа** (`match-auth.service.ts:268`). При утечке (логи/history/прокси) окно переиспользования = сутки. Telegram рекомендует ≤ 5 минут.
2. **Нет rate-limit на `/match-api/auth` и `/match-api/profile`.** Эндпоинт `/profile` — точка редима инвайта, перебор кодов ничем не ограничен.
3. **Энтропия инвайт-кода 32⁸ ≈ 1.1 × 10¹²** (`match.utils.ts`, 8 символов). При отсутствии rate-limit недостаточно.
4. **Фронт падал с абстрактным «Mini App нужно открыть из Telegram»** даже если initData просто не успела проинжектиться или истекла после долгого онбординга.
5. **Invite-only был fail-open** (`process.env.MATCH_INVITE_ONLY === '1'`). На проде переменная не задана → регистрации идут без инвайта. Это главная причина жалобы «проходят без инвайта».
6. **Admin `/match-admin/users` падал 500** на любом невалидном значении `role`/`workFormat`/`marketplace` — Prisma-enum, а в UI свободный `<input>`.

---

## P0 — что уже в коде (не откатывать)

### 0.1 TTL initData: 24h → 15 минут

**Файл:** `apps/api/src/modules/match/match-auth.service.ts:268`

```ts
// 15 min TTL — компромисс между рекомендацией Telegram (5 мин) и UX:
// онбординг с фото и длинными списками навыков реально занимает 5+ минут.
validate(initData, this.getMatchBotToken(), { expiresIn: 900 });
```

### 0.2 Глобальный `ThrottlerGuard` + жёсткие лимиты

**Файлы:**
- `apps/api/package.json` — добавлен `"@nestjs/throttler": "^6.4.0"`
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

**Файл:** `apps/api/src/modules/match/match.utils.ts`

```ts
const INVITE_CODE_LENGTH = 10;
// 32^10 ≈ 1.1e15. Старые коды XXXX-XXXX (len=9) остаются валидными,
// normalizeInviteCode + findUnique по code работают без изменений.
```

### 0.4 Фронт принимает оба формата

**Файл:** `apps/web/app/m/_components/MatchInviteClient.tsx`

```ts
const VALID_CODE_LENGTHS = new Set([9, 11]); // 4-4 и 5-5
// normalizeInviteCode: если 8 символов → 4-4 (legacy), иначе пополам
```

Placeholder `<input>` → `XXXXX-XXXXX`.

### 0.5 Ретрай ожидания `initData` + разделение UX-ошибок

**Файлы:**
- `apps/web/app/m/_lib/telegram.ts` — новые экспорты `waitForInitData(timeoutMs)` и `hasTelegramWebApp()`
- `apps/web/app/m/_lib/api.ts` — класс `MatchAuthError` с кодами `AUTH_ERROR_NO_TELEGRAM` и `AUTH_ERROR_INIT_DATA_LOST`; `ensureTelegramAuthToken` ждёт до 5 сек и различает причины
- `apps/web/app/m/_components/MatchBootstrap.tsx` — классификатор ошибки, разные UI-сообщения, кнопка «Перезагрузить» для `INIT_DATA_LOST`

### 0.6 Invite-only как fail-safe дефолт

**Корень бага:**
```ts
// ДО:
private isInviteOnlyEnabled() {
  return process.env.MATCH_INVITE_ONLY?.trim() === '1';
}
// Если переменной нет → false → открытая регистрация.
```

На прод-сервере `/var/www/tindermp/apps/api/.env` переменной нет вообще, поэтому регистрации шли без инвайта.

**После правки:**

Файл `apps/api/src/modules/match/match.utils.ts` — общий helper:

```ts
/**
 * Fail-safe: invite-only ON, если переменная НЕ задана или задана
 * как 1/true/yes. Отключается только явным 0/false/no/off.
 */
export function isInviteOnlyModeEnabled(): boolean {
  const raw = process.env.MATCH_INVITE_ONLY?.trim().toLowerCase();
  if (raw === undefined || raw === '') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }
  return true;
}
```

Файлы `profile.service.ts` и `match-maintenance.service.ts` теперь оба используют этот helper — чтобы onboarding и периодические гранты не могли рассинхронизироваться.

Также обновлены `apps/api/.env.example` и `apps/api/README.md` с комментарием про fail-safe поведение.

**Инвариант:** не возвращай `=== '1'`. Любая ошибка в env должна приводить к более безопасному состоянию (invite-only ON), а не к открытой регистрации.

### 0.7 Валидация enum-фильтров в admin `/users`

**Корень бага:** `apps/web/app/admin/match/users/page.tsx` имел свободный `<input>` для роли → админ мог вбить `seller` (нижний регистр) → контроллер прокидывал через `role as never` → Prisma падала 500 `Invalid value for argument 'role'. Expected MatchRole.`

**Файлы:**
- `apps/api/src/modules/match-admin/match-admin.service.ts` — хелпер `coerceEnum(raw, enumObject)`, case-insensitive, возвращает `null` при невалиде. `users()` теперь логирует `Logger.warn('admin users filter: invalid role "foo" — ignored')` и **игнорирует** невалидный фильтр, а не падает.
- `apps/api/src/modules/match-admin/match-admin.controller.ts` — убран `as never`, фильтры передаются как обычные строки.
- `apps/web/app/admin/match/users/page.tsx` — `<input>` заменён на `<select>` с опциями из `MATCH_ROLES` (тот же справочник, что в мини-аппе).

**Инвариант:** не возвращай `as never` в контроллере. Любое поле-enum из query → через `coerceEnum`.

---

## P1 — установить зависимость и прогнать типы/линт/тесты

```bash
cd /path/to/match-app
pnpm install                             # подтянет @nestjs/throttler@^6.4.0

cd apps/api
pnpm exec tsc --noEmit -p tsconfig.json  # 0 ошибок
pnpm run lint
pnpm run test                            # существующие тесты должны пройти

cd ../web
pnpm exec tsc --noEmit -p tsconfig.json  # 0 ошибок
pnpm run lint
```

До `pnpm install` tsc по api падает на двух импортах `@nestjs/throttler` — после установки ошибки исчезнут.

---

## P2 — добавить тесты на новые инварианты

### 2.1 `apps/api/src/modules/match/match.utils.spec.ts` (создать)

```ts
import {
  generateInviteCode,
  isInviteOnlyModeEnabled,
  normalizeInviteCode,
} from './match.utils';

describe('generateInviteCode', () => {
  it('формат XXXXX-XXXXX, длина 11', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(code).toHaveLength(11);
    }
  });

  it('не использует I, O, 0, 1', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateInviteCode()).not.toMatch(/[IO01]/);
    }
  });

  it('не дублируется в большой выборке', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i += 1) seen.add(generateInviteCode());
    expect(seen.size).toBe(1_000);
  });
});

describe('normalizeInviteCode', () => {
  it('uppercase, не трогает дефис', () => {
    expect(normalizeInviteCode(' abcde-fghjk ')).toBe('ABCDE-FGHJK');
  });

  it('не ломает legacy-коды 4-4', () => {
    expect(normalizeInviteCode('abcd-efgh')).toBe('ABCD-EFGH');
  });
});

describe('isInviteOnlyModeEnabled', () => {
  const original = process.env.MATCH_INVITE_ONLY;
  afterEach(() => {
    if (original === undefined) delete process.env.MATCH_INVITE_ONLY;
    else process.env.MATCH_INVITE_ONLY = original;
  });

  it('не задана → true (fail-safe)', () => {
    delete process.env.MATCH_INVITE_ONLY;
    expect(isInviteOnlyModeEnabled()).toBe(true);
  });

  it('пустая → true', () => {
    process.env.MATCH_INVITE_ONLY = '';
    expect(isInviteOnlyModeEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off', 'FALSE'])('%s → false', (value) => {
    process.env.MATCH_INVITE_ONLY = value;
    expect(isInviteOnlyModeEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'yes', 'garbage'])('%s → true', (value) => {
    process.env.MATCH_INVITE_ONLY = value;
    expect(isInviteOnlyModeEnabled()).toBe(true);
  });
});
```

### 2.2 Smoke-скрипт rate-limit (локально/staging)

```bash
# /auth: 11-я попытка → 429
for i in $(seq 1 11); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3001/match-api/auth \
    -H 'Content-Type: application/json' \
    -d '{"initData":"invalid"}'
done
# Ожидание: 401 × 10, затем 429
```

### 2.3 Smoke: admin filters (локально/staging)

```bash
# Невалидная роль → 200 (фильтр игнорируется) + warn в логах
curl -s "http://127.0.0.1:3001/match-admin/users?role=foo" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | head -c 200

# Валидная роль → 200, только профили SELLER
curl -s "http://127.0.0.1:3001/match-admin/users?role=SELLER" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | head -c 200

# Case-insensitive → тоже работает
curl -s "http://127.0.0.1:3001/match-admin/users?role=seller" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | head -c 200
```

### 2.4 Ручная проверка UX мини-аппа

1. Открыть в обычном браузере → «Запуск не из Telegram», без кнопки reload.
2. Открыть из Telegram → успешно. Подождать 16 минут в онбординге → «Сессия истекла», кнопка «Перезагрузить» → reload → успешный повторный вход.

---

## P3 — git flow и деплой

### 3.1 Закоммитить и запушить

```bash
cd /path/to/match-app

# Убедиться, что ветка чистая от нерелевантных правок
git status

# Одной логической группой или отдельными коммитами по слоям:
git add apps/api/package.json \
        apps/api/src/app.module.ts \
        apps/api/src/modules/match/match.controller.ts \
        apps/api/src/modules/match/match-auth.service.ts \
        apps/api/src/modules/match/match.utils.ts \
        apps/api/src/modules/match/match-maintenance.service.ts \
        apps/api/src/modules/match/profile.service.ts \
        apps/api/src/modules/match-admin/match-admin.controller.ts \
        apps/api/src/modules/match-admin/match-admin.service.ts \
        apps/api/.env.example \
        apps/api/README.md \
        apps/web/app/m/_lib/api.ts \
        apps/web/app/m/_lib/telegram.ts \
        apps/web/app/m/_components/MatchBootstrap.tsx \
        apps/web/app/m/_components/MatchInviteClient.tsx \
        apps/web/app/admin/match/users/page.tsx \
        docs/CURSOR_TASKS_AUTH_RATELIMIT.md

# Добавить новый тест (после P2.1)
git add apps/api/src/modules/match/match.utils.spec.ts

git commit -m "hardening: invite-only fail-safe, rate-limit, initData TTL 15m, admin enum validation"

# Если работаем в feature-branch — создать и запушить
git switch -c hardening/auth-invites-admin 2>/dev/null || true
git push -u origin hardening/auth-invites-admin
```

Если коммитим прямо в main (один разработчик) — `git push origin main`.

### 3.2 Хот-фикс на проде до деплоя нового кода

Чтобы invite-only включился **прямо сейчас**, не дожидаясь rebuild'а:

```bash
ssh root@7022995-ta305874
cd /var/www/tindermp

# Добавить переменную, если её нет
grep -q '^MATCH_INVITE_ONLY=' apps/api/.env \
  || echo 'MATCH_INVITE_ONLY=1' >> apps/api/.env

grep MATCH_INVITE_ONLY apps/api/.env  # убедиться что записалось

pm2 restart match-api
pm2 logs match-api --lines 30 --nostream
```

После деплоя нового кода эта переменная станет необязательной (fail-safe дефолт сам включит режим), но лучше оставить её в `.env` для явности.

### 3.3 Полный деплой нового кода

```bash
ssh root@7022995-ta305874
cd /var/www/tindermp

git pull                                   # или `git fetch && git merge origin/hardening/...`
pnpm install --frozen-lockfile             # поставит @nestjs/throttler
pnpm --filter @match/api run build
pnpm --filter @match/web run build

pm2 restart match-api match-web
pm2 logs match-api --lines 50 --nostream
```

В логах после рестарта — `Nest application successfully started`, никаких предупреждений ThrottlerModule.

---

## P4 — post-deploy верификация на проде

### 4.1 Invite-only реально включён

```bash
# На проде с токеном обычного пользователя (не админ, не bypass-username)
curl -s -w '\n%{http_code}\n' \
  -X POST https://match.example.com/match-api/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"role":"SELLER","displayName":"Test"}'
# Ожидание: {"code":"invite_required"}, HTTP 400
```

### 4.2 TTL 15 минут

1. Скопировать свежую `initData` из DevTools (`window.Telegram.WebApp.initData`).
2. Подождать 16 минут.
3. `POST /match-api/auth` с этой initData → `401 Telegram initData has expired`.

### 4.3 Rate-limit на /profile

```bash
for i in 1 2 3 4 5 6; do
  curl -s -w "\n%{http_code}\n" \
    -X POST https://match.example.com/match-api/profile \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"inviteCode\":\"TEST$i-AAAAA\",\"role\":\"SELLER\",\"displayName\":\"X\"}"
done
```
Ожидание: 1-5 → `400 invite_invalid`, 6-я → `429 Too Many Requests`.

### 4.4 Новая длина кодов в БД

```sql
SELECT code, LENGTH(code) AS len, "createdAt"
FROM "MatchInviteCode"
WHERE "createdAt" > now() - interval '1 hour'
ORDER BY "createdAt" DESC
LIMIT 20;
```
Новые коды `len = 11`. Старые `len = 9` остаются валидными (backward compat).

### 4.5 Admin фильтр не падает

1. Открыть `/admin/match/users` → дропдаун «Роль: все» с опциями из `MATCH_ROLES`.
2. Выбрать любую роль → таблица фильтруется.
3. В URL подменить `?role=foo` → страница открывается, фильтр игнорируется, в `pm2 logs match-api` строка `admin users filter: invalid role "foo" — ignored`.

### 4.6 UX мини-аппа

- Из браузера → «Запуск не из Telegram», кнопки перезагрузки нет.
- Из Telegram после 16 минут простоя → «Сессия Telegram истекла», кнопка «Перезагрузить» → после клика вход проходит.

---

## Что прислать после выполнения

1. Ссылку на коммит(ы) или PR.
2. Вывод `pnpm --filter @match/api run test` с passing `match.utils.spec.ts`.
3. Результат smoke 2.2 — последний код = `429`.
4. Скриншот/вывод п. 4.1 (invite_required для обычного юзера).
5. SQL-вывод п. 4.4 (несколько кодов `len = 11`).
6. Скриншоты UX из п. 4.6 (две разные ошибки).

---

## Изменённые файлы (для ревью)

```
apps/api/package.json
apps/api/.env.example
apps/api/README.md
apps/api/src/app.module.ts
apps/api/src/modules/match/match.controller.ts
apps/api/src/modules/match/match-auth.service.ts
apps/api/src/modules/match/match.utils.ts
apps/api/src/modules/match/match-maintenance.service.ts
apps/api/src/modules/match/profile.service.ts
apps/api/src/modules/match-admin/match-admin.controller.ts
apps/api/src/modules/match-admin/match-admin.service.ts
apps/web/app/m/_lib/api.ts
apps/web/app/m/_lib/telegram.ts
apps/web/app/m/_components/MatchBootstrap.tsx
apps/web/app/m/_components/MatchInviteClient.tsx
apps/web/app/admin/match/users/page.tsx
docs/CURSOR_TASKS_AUTH_RATELIMIT.md
```

Плюс новый файл из P2.1: `apps/api/src/modules/match/match.utils.spec.ts`.

---

## Инварианты (не ломать в последующих правках)

- `expiresIn` в `validate(initData, ...)` — не больше 900 секунд.
- `@Throttle` на `/auth` (10/мин) и `/profile` (5/мин) + глобальный `ThrottlerGuard` — обязательны.
- `INVITE_CODE_LENGTH` — чётное, ≥ 10. `VALID_CODE_LENGTHS` на фронте = `{9, 11}` пока в БД есть активные legacy-коды.
- `waitForInitData` — единственная точка ожидания initData. Синхронный `getInitDataForAuth()` в auth-потоке не вызывать.
- `MatchAuthError` с `AUTH_ERROR_NO_TELEGRAM` / `AUTH_ERROR_INIT_DATA_LOST` — не сливать в одно сообщение.
- `isInviteOnlyModeEnabled()` fail-safe: отсутствие переменной = invite-only ON. Не возвращай `=== '1'`.
- Любое query-поле-enum в admin → через `coerceEnum`. Никаких `as never` в контроллере.
- Админы/bypass-usernames остаются единственными двумя обходами `invite_required`.
