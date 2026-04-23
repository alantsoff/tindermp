# Match-app — план исправлений для Cursor

> Аудит проекта от 2026-04-19. Проблемы отсортированы по приоритету: сначала то, что ломает прод/сборку, потом безопасность и логика, потом косметика.
>
> Инструкция для агента: выполняй задачи по порядку, после каждого блока запускай `pnpm -r run lint && pnpm -r run test` и `pnpm build`. Не переходи к следующему приоритету, пока текущий не зелёный.

---

## P0 — блокеры сборки и деплоя

### 1. Создать начальную Prisma-миграцию

**Файлы:** `packages/db/prisma/migrations/`

Сейчас миграций нет, только `schema.prisma`. `pnpm db:migrate:deploy` на свежей базе упадёт.

Шаги:

```bash
# предварительно завести чистую dev-базу
pnpm --filter @match/db exec prisma migrate dev --name init
```

После этого:
- закоммитить папку `packages/db/prisma/migrations/` в git;
- проверить, что `pnpm db:migrate:deploy` на чистой базе отрабатывает без ошибок.

Если в репозитории уже есть прод-база с данными, использовать `prisma migrate diff` и собрать baseline вручную — **не накатывать `migrate dev` на прод**.

### 2. Коммитить `pnpm-lock.yaml`

**Файл:** `.gitignore` (строка с `pnpm-lock.yaml`)

`scripts/deploy-pull-build.sh` вызывает `pnpm install --frozen-lockfile`, которому лок-файл обязателен. Сейчас он в `.gitignore` — на чистом клоне деплой упадёт.

Патч:

```diff
--- a/.gitignore
+++ b/.gitignore
@@
-pnpm-lock.yaml
```

Затем `git add pnpm-lock.yaml && git commit`.

### 3. Починить `apps/web/.gitignore` для `.env.example`

**Файл:** `apps/web/.gitignore`

Правило `.env*` без исключения `!.env.example` — файл не попадает в git (в корневом `.gitignore` исключение есть, во вложенном нет).

```diff
 # env files (can opt-in for committing if needed)
 .env*
+!.env.example
```

Проверить: `git check-ignore -v apps/web/.env.example` должен вернуть 1 (не игнорируется).

### 4. Исправить конструктор `MatchAdminGuard` под новый `MatchAuthGuard`

**Файлы:**
- `apps/api/src/modules/match/match-auth.guard.ts` (uncommitted diff уже добавил 4-й параметр `SwipeService`)
- `apps/api/src/modules/match/match-admin.guard.ts`

В текущем `match-admin.guard.ts`:

```ts
constructor(
  authService: MatchAuthService,
  private readonly prismaService: PrismaService,
  eventLogger: EventLoggerService,
) {
  super(authService, prismaService, eventLogger);
}
```

Нужно:

```ts
constructor(
  authService: MatchAuthService,
  private readonly prismaService: PrismaService,
  eventLogger: EventLoggerService,
  swipeService: SwipeService,
) {
  super(authService, prismaService, eventLogger, swipeService);
}
```

И добавить `import { SwipeService } from './swipe.service';`.

Убедиться, что в `MatchAdminModule` `SwipeService` доступен через `MatchModule` (он уже экспортируется косвенно через imports; если нет — добавить в exports `MatchModule`).

**Acceptance:** любой эндпоинт `/match-api/admin/*` через `MatchAdminGuard` стартует без `Cannot read property 'maybeAutoCatchupReset' of undefined`.

### 5. Подключить `AppController`/`AppService` либо удалить их

**Файлы:** `apps/api/src/app.module.ts`, `apps/api/src/app.controller.ts`, `apps/api/src/app.service.ts`, `apps/api/test/app.e2e-spec.ts`

Сейчас `AppController` нигде не подключён — e2e-тест `GET / → "Hello World!"` падает.

Рекомендуется **удалить** неиспользуемые файлы и соответствующий e2e-тест, а если нужен корневой `/` — заменить на редирект на `/match-api/health`:

Вариант удаления:

```bash
rm apps/api/src/app.controller.ts apps/api/src/app.controller.spec.ts apps/api/src/app.service.ts apps/api/test/app.e2e-spec.ts
```

Плюс убрать `import`-ы в `app.module.ts` (сейчас их там нет — ничего не меняется).

### 6. Удалить мок несуществующей модели `matchReferralReward`

**Файл:** `apps/api/src/modules/match/swipe.service.spec.ts`

`prisma.matchReferralReward` не существует в `schema.prisma`. Удалить упоминания:

```diff
-    matchReferralReward: { findUnique: jest.fn(), create: jest.fn() },
     $transaction: jest.fn(),
@@
-    prisma.matchReferralReward.findUnique.mockResolvedValue(null);
```

Если в будущем реферральная механика нужна — добавить модель в schema.prisma и вернуть мок.

---

## P1 — прод-роутинг и инфра

### 7. Починить `/health` в проде

**Файл:** `docs/DEPLOY.md` (nginx config) и/или `apps/api/src/main.ts`

Сейчас `HealthController = @Controller('health')`, а nginx проксирует только `/match-api/*` и `/telegram-webhook/match`. `GET /health` из smoke-check в DEPLOY.md попадает на Next.js.

Два варианта — выбрать один:

**Вариант A (предпочтительно):** дать API глобальный префикс, чтобы всё было под одним location:

```ts
// main.ts
app.setGlobalPrefix('match-api', {
  exclude: [
    { path: 'telegram-webhook/match', method: RequestMethod.POST },
    { path: 'match-media/(.*)', method: RequestMethod.GET },
  ],
});
```

И перенести `/health` под `@Controller('match-api/health')` (или положиться на префикс). Smoke-check в DEPLOY.md заменить на `GET /match-api/health`.

**Вариант B:** добавить nginx location:

```nginx
location = /health {
    proxy_pass http://127.0.0.1:3001/health;
    ...
}
```

### 8. Добавить nginx-location для `/match-media/`

**Файл:** `docs/DEPLOY.md`

В `main.ts` API раздаёт `app.use('/match-media', express.static(...))`, но nginx про это не знает.

```nginx
location /match-media/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    # можно добавить кеш
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

Либо раздавать статику напрямую nginx-ом через `alias /var/www/match-app/apps/api/storage/match-media/`.

### 9. Починить путь хранилища фото

**Файл:** `apps/api/src/main.ts` и `apps/api/src/modules/match/photos.service.ts`

`process.cwd()` в PM2 равен корню монорепа, а папка на диске — `apps/api/storage/`.

В `.env.example` уже есть `MATCH_UPLOADS_DIR`. В DEPLOY.md добавить обязательное требование установить его. Плюс изменить дефолт на путь относительно `__dirname`:

```ts
// main.ts
import { resolve } from 'node:path';
const uploadsRoot =
  process.env.MATCH_UPLOADS_DIR?.trim() ||
  resolve(__dirname, '..', 'storage', 'match-media');
```

Аналогично в `photos.service.ts getUploadsRoot()`.

### 10. Добавить `pnpm db:generate` в deploy-скрипт

**Файл:** `scripts/deploy-pull-build.sh`

Между `pnpm install` и `pnpm build`:

```diff
 pnpm install --frozen-lockfile

+# generate Prisma client explicitly (postinstall can be skipped)
+pnpm db:generate
+
 if [[ "${SKIP_MIGRATE:-0}" != "1" ]]; then
   pnpm db:migrate:deploy
 fi
```

---

## P2 — Rules of Hooks

### 11. Починить `BottomTabs.tsx`

**Файл:** `apps/web/app/m/_components/BottomTabs.tsx`

Все хуки должны быть ДО условного `return`. Перенести `useMatches` и `useMemo` наверх:

```tsx
export function BottomTabs() {
  const pathname = usePathname();
  const { data: matches } = useMatches();
  const unreadCount = useMemo(() => {
    if (!matches?.length) return 0;
    return matches.reduce((acc, pair) => acc + (pair.hasUnread ? 1 : 0), 0);
  }, [matches]);

  if (pathname.startsWith('/m/onboarding') || pathname.startsWith('/m/invite')) {
    return null;
  }

  return (
    <nav ...>
      {/* ... */}
    </nav>
  );
}
```

### 12. Починить `MatchesPage`

**Файл:** `apps/web/app/m/matches/page.tsx`

`useMemo` сейчас после `if (isLoading) return` и `if (!data?.length) return`. Перенести наверх и учитывать пустые данные внутри:

```tsx
export default function MatchesPage() {
  const { data, isLoading } = useMatches();
  const archivePair = useArchivePair();
  const unarchivePair = useUnarchivePair();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');

  const filtered = useMemo(() => {
    if (!data?.length) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return data.filter((pair) => {
      // ... существующая логика
    });
  }, [data, filter, query]);

  if (isLoading) return <div>Загружаем матчи…</div>;
  if (!data?.length) return <div>Пока нет матчей.</div>;

  // остальной JSX
}
```

**Acceptance:** прогнать `pnpm --filter @match/web test` — все рендеры должны быть без warning'а от React про hook order.

Проверить остальные страницы `/m/*` на ту же ошибку: хуки должны идти до любого условного `return`.

---

## P3 — безопасность и логика

### 13. Вынести `alantsoff` бэкдор в env

**Файл:** `apps/api/src/modules/match/profile.service.ts`

```diff
-  private isInviteBypassUsername(telegramUsername?: string | null): boolean {
-    return telegramUsername?.trim().toLowerCase() === 'alantsoff';
+  private isInviteBypassUsername(telegramUsername?: string | null): boolean {
+    if (!telegramUsername) return false;
+    const bypass = (process.env.MATCH_INVITE_BYPASS_USERNAMES ?? '')
+      .split(',')
+      .map((v) => v.trim().toLowerCase())
+      .filter(Boolean);
+    return bypass.includes(telegramUsername.trim().toLowerCase());
   }
```

Добавить в `apps/api/.env.example`:

```
MATCH_INVITE_BYPASS_USERNAMES=
```

### 14. Уважать `MATCH_INVITE_ONLY`

**Файл:** `apps/api/src/modules/match/profile.service.ts`

```diff
-  private isInviteOnlyEnabled(): boolean {
-    return true;
-  }
+  private isInviteOnlyEnabled(): boolean {
+    return process.env.MATCH_INVITE_ONLY?.trim() === '1';
+  }
```

Параллельно в `inviteRequired` логике учитывать этот флаг (сейчас он считается всегда-true).

### 15. Убрать слабый дефолт секрета

**Файл:** `apps/api/src/modules/match/match-admin.service.ts`

```diff
   private tokenSecret(): string {
-    return process.env.MATCH_JWT_SECRET?.trim() || 'match-admin-secret';
+    const secret = process.env.MATCH_JWT_SECRET?.trim();
+    if (!secret) {
+      throw new ServiceUnavailableException('MATCH_JWT_SECRET is not configured');
+    }
+    return secret;
   }
```

### 16. Хешировать `ADMIN_WEB_PASSWORD` и добавить rate-limit

**Файл:** `apps/api/src/modules/match-admin/admin-web-auth.service.ts`

Короткая программа:
1. Хранить не plain-текст, а bcrypt-хеш (`ADMIN_WEB_PASSWORD_HASH`).
2. Использовать `bcrypt.compare` (`npm i bcrypt @types/bcrypt`).
3. Добавить простой in-memory лимит (3 попытки / 10 минут на telegramId).

Минимальный патч — хотя бы хеш:

```ts
import * as bcrypt from 'bcrypt';

private async verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.ADMIN_WEB_PASSWORD_HASH?.trim();
  if (!hash) throw new ServiceUnavailableException('ADMIN_WEB_PASSWORD_HASH is not configured');
  return bcrypt.compare(password, hash);
}
```

Документировать в DEPLOY.md, как сгенерировать хеш: `node -e "console.log(require('bcrypt').hashSync(process.argv[1], 12))" 'my-pass'`.

### 17. Сузить CORS

**Файл:** `apps/api/src/main.ts`

```diff
-  app.enableCors({
-    origin: true,
-    credentials: true,
-  });
+  const allowedOrigins = (process.env.MATCH_CORS_ORIGINS ?? '')
+    .split(',')
+    .map((v) => v.trim())
+    .filter(Boolean);
+  app.enableCors({
+    origin: allowedOrigins.length ? allowedOrigins : false,
+    credentials: true,
+  });
```

В `.env.example`:

```
MATCH_CORS_ORIGINS=https://match.example.com
```

### 18. Починить undo-свайпа

**Файл:** `apps/api/src/modules/match/swipe.service.ts` — метод `undoLastSwipe`.

Сейчас удаление `MatchSwipe` не трогает `MatchPair`, super-like balance, streak. Нужно в транзакции:

```ts
await this.prisma.$transaction(async (tx) => {
  // 1. найти возможную пару и удалить её (каскадно удалит messages/reads)
  if (lastSwipe.direction === 'LIKE') {
    const pairKeys = normalizePairIds(profileId, lastSwipe.toProfileId);
    await tx.matchPair.deleteMany({ where: { profileAId_profileBId: pairKeys } });
  }
  // 2. если был super-like — вернуть балланс
  if (lastSwipe.isSuperLike) {
    await tx.matchProfile.update({
      where: { id: profileId },
      data: { superLikeBalance: { increment: 1 } },
    });
  }
  // 3. удалить сам свайп
  await tx.matchSwipe.delete({ where: { id: lastSwipe.id } });
  // 4. обновить lastUndoAt
  await tx.matchProfile.update({
    where: { id: profileId },
    data: { lastUndoAt: new Date() },
  });
});
```

Streak: решить политикой — либо не откатывать (и задокументировать), либо откатывать по тому же принципу. Минимум — задокументировать в `match.constants.ts` или README.

### 19. Ослабить лимит размера фото

**Файл:** `apps/api/src/modules/match/photos.service.ts`

```diff
-const MAX_FILE_SIZE_BYTES = 500 * 1024;
+const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
```

Плюс fallback: если после `q82` не влезло — пересохранить с `q70`, потом `q60`:

```ts
async function compress(buffer: Buffer): Promise<Buffer> {
  for (const quality of [82, 70, 60]) {
    const out = await sharp(buffer)
      .rotate()
      .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (out.byteLength <= MAX_FILE_SIZE_BYTES) return out;
  }
  throw new BadRequestException('image_too_large_after_compression');
}
```

### 20. Перевести `uploadPhoto` на `matchFetch`

**Файл:** `apps/web/app/m/_lib/api.ts`

Сейчас `uploadPhoto` делает `fetch` напрямую и на 401 падает. Нужно сохранить поведение re-auth, но с FormData:

```ts
async uploadPhoto(file: File) {
  if (!getToken()) await ensureTelegramAuthToken();
  const formData = new FormData();
  formData.append('file', file);
  const runUpload = async () => {
    const token = getToken();
    const response = await fetch(buildApiUrl('/match-api/photos'), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    return response;
  };
  let response = await runUpload();
  if (response.status === 401) {
    clearMatchToken();
    await ensureTelegramAuthToken();
    response = await runUpload();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.code ?? payload.message ?? 'photo_upload_failed');
  }
  return response.json();
},
```

### 21. Нормализовать регистр ниш в фильтре ленты

**Файл:** `apps/api/src/modules/match/feed.service.ts`

Все `niches` привести к lower-case и на записи (в `profile.service.ts uniqTrimmed`), и на чтение. Простейший вариант — в `uniqTrimmed` делать `value.toLocaleLowerCase()`, и показывать в UI `.toLocaleUpperCase()` для заглавных нишей. Либо построить lower-case массив для сравнения в SQL:

```ts
const normalizedNiches = niches.map((n) => n.toLowerCase());
// в SQL:
// AND (cardinality(${normalizedNiches}::text[]) = 0 OR lower(p.niches) && ${normalizedNiches}::text[])
```

Postgres не умеет `lower()` на массиве напрямую — нужно `array(select lower(unnest(p.niches)))`. Либо хранить нормализованные значения.

Простое решение: нормализовать при записи (`uniqTrimmed`) и при чтении фильтра, и на клиенте при вводе.

### 22. Переделать лимит лайков на «0:00 по Москве»

**Файл:** `apps/api/src/modules/match/swipe.service.ts`, `apps/api/src/modules/match/profile.service.ts`

Ввести хелпер:

```ts
// match.utils.ts
export function startOfMoscowDay(date: Date): Date {
  // MSK = UTC+3, без DST
  const msk = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const day = new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()));
  return new Date(day.getTime() - 3 * 60 * 60 * 1000);
}
```

И заменить `startOfUtcDay(new Date())` на `startOfMoscowDay(new Date())` для подсчёта `likeCountToday` и `resetAt`.

### 23. Дедупликация `MINIAPP_OPENED`

**Файл:** `apps/api/src/modules/match/match-auth.guard.ts`

Сейчас на двух параллельных запросах оба могут залогировать `MINIAPP_OPENED`. Сделать через atomic-check:

```ts
const updated = await this.prisma.matchProfile.updateMany({
  where: { id: profileId, lastActiveAt: { lt: fiveMinutesAgo } },
  data: { lastActiveAt: new Date() },
});
if (updated.count === 1) {
  void this.eventLogger.log({ profileId, userId, type: 'MINIAPP_OPENED' });
}
```

`updateMany.count` уже корректно отражает число атомарно обновлённых строк. Но event можно отправлять только один раз в 5 минут на профиль — ввести in-memory debounce или полагаться на `updated.count === 1`. Текущий код `> 0` нормальный, но из-за race двух запросов оба могут увидеть `count === 1`. Решение: добавить условие «и не было обновления в этой транзакции» или принять дубли. Документировать compromise.

---

## P4 — качество кода и мелочи

### 24. Выровнять версии `@prisma/client`

**Файл:** `apps/api/package.json`, `packages/db/package.json`

Привести к одной версии:

```diff
- "@prisma/client": "^6.19.3",
+ "@prisma/client": "^6.19.2",
```

(или наоборот, просто синхронизировать).

### 25. Выровнять `@types/node`

**Файл:** `apps/api/package.json`, `apps/web/package.json`

Взять общую LTS:

```diff
- "@types/node": "^24.0.0",
+ "@types/node": "^20.0.0",
```

### 26. Включить `"strict": true` в API tsconfig

**Файл:** `apps/api/tsconfig.json`

```diff
   "compilerOptions": {
     ...
-    "strictNullChecks": true,
-    "forceConsistentCasingInFileNames": true,
-    "noImplicitAny": true,
-    "strictBindCallApply": true,
+    "strict": true,
+    "forceConsistentCasingInFileNames": true,
     "noFallthroughCasesInSwitch": true
   }
```

После этого прогнать `pnpm --filter @match/api run build` и починить все всплывшие ошибки.

### 27. Стабилизировать PM2-скрипт

**Файл:** `ecosystem.config.cjs`

`script: 'pnpm'` хрупко. Заменить на прямой запуск Node:

```js
{
  name: 'match-api',
  cwd: path.join(rootDir, 'apps/api'),
  script: 'dist/main.js',
  interpreter: 'node',
  env: { NODE_ENV: 'production', PORT: '3001' },
  autorestart: true,
  max_restarts: 10,
},
{
  name: 'match-web',
  cwd: path.join(rootDir, 'apps/web'),
  script: 'node_modules/next/dist/bin/next',
  args: 'start -p 3000',
  interpreter: 'node',
  env: { NODE_ENV: 'production' },
  autorestart: true,
  max_restarts: 10,
},
```

### 28. Документировать недостающие env-переменные

**Файл:** `apps/api/.env.example`

Добавить:

```
# Auto-reset feature
MATCH_AUTO_SWIPE_RESET=0
MATCH_SWIPE_RESET_COOLDOWN_DAYS=14
MATCH_AUTO_RESET_INACTIVITY_THRESHOLD_DAYS=60

# Admin backdoor для legacy-пользователей
MATCH_INVITE_BYPASS_USERNAMES=

# CORS
MATCH_CORS_ORIGINS=

# Admin login
ADMIN_WEB_PASSWORD_HASH=

# Media
MATCH_UPLOADS_DIR=
MATCH_MEDIA_BASE_URL=
```

### 29. Заменить `<img>` на `next/image` в SwipeCard

**Файл:** `apps/web/app/m/_components/SwipeCard.tsx`

```tsx
import Image from 'next/image';
// ...
<Image
  src={photos[photoIndex] ?? photos[0]}
  alt={card.displayName}
  fill
  sizes="(max-width: 480px) 100vw, 400px"
  className="object-cover"
/>
```

В `next.config.ts` добавить `images.remotePatterns` для `match-media` и домена Telegram.

### 30. Исправить Tailwind `duration-250`

**Файл:** `apps/web/app/m/_components/SwipeStack.tsx`

Такого класса в дефолте нет. Либо поменять на `duration-200` / `duration-300`, либо прописать custom в tailwind config. Простое:

```diff
-className="absolute inset-0 touch-none transition-transform duration-250 ease-out"
+className="absolute inset-0 touch-none transition-transform duration-200 ease-out"
```

### 31. Поиск по invite-коду с нормализацией

**Файл:** `apps/api/src/modules/match-admin/match-admin.service.ts` — `searchInviteTree`

```diff
-invitesIssued: { some: { code: { equals: query.toUpperCase() } } },
+invitesIssued: { some: { code: { equals: normalizeInviteCode(query) } } },
```

`normalizeInviteCode` уже есть в `match.utils.ts`.

### 32. Не считать непрочитанным system-сообщения

**Файл:** `apps/api/src/modules/match/swipe.service.ts` — `getMatches`

```diff
 for (const message of lastMessages) {
   if (message.senderProfileId === profileId) continue;
+  if (message.systemGenerated) continue;
   const lastReadAt = readByPair.get(message.pairId);
```

### 33. Заменить README-боилерплейты

**Файлы:** `apps/api/README.md`, `apps/web/README.md`

Сейчас это дефолтные тексты от NestJS и Next.js CRA. Переписать под Match: как запустить локально, какие env нужны, ссылка на `docs/DEPLOY.md`.

### 34. Логировать коллизии invite-кодов

**Файл:** `apps/api/src/modules/match/invite.service.ts` — `createCodes`

```diff
+      } catch (err) {
+        this.logger.warn?.(
+          `invite code collision on attempt ${i + 1}: ${err instanceof Error ? err.message : 'unknown'}`,
+        );
       }
```

Плюс добавить `private readonly logger = new Logger(InviteService.name);`.

### 35. Дополнить nginx-пример в DEPLOY.md

**Файл:** `docs/DEPLOY.md`

В пример добавить блок SSL:

```nginx
ssl_certificate /etc/letsencrypt/live/match.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/match.example.com/privkey.pem;
include /etc/letsencrypt/options-ssl-nginx.conf;
ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
```

И блок `server { listen 80; ... return 301 https://$host$request_uri; }`.

---

## Финальный чеклист

После всех правок:

```bash
# 1. Установка
pnpm install

# 2. Проверки
pnpm -r run lint
pnpm -r run test
pnpm build

# 3. Проверить, что e2e поднимается
pnpm --filter @match/api run test:e2e

# 4. Локальный запуск
pnpm db:generate
pnpm dev
# → http://localhost:3001/match-api/health (после фикса #7) → { status: 'ok' }
# → http://localhost:3000/m

# 5. Подготовить миграцию и проверить её
pnpm --filter @match/db exec prisma migrate status
```

Если всё зелёное — собирать PR и прокатывать на staging.
