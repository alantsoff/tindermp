# Performance Audit — match-app
**Дата:** 2026-04-22
**Объём:** apps/api (NestJS 11 + Prisma 6 + sharp), apps/web (Next.js 16 + React Query 5 + zustand + dnd-kit), packages/db (Prisma).
**Подход:** прошёлся по hot path свайп-фида и чата, проверил DDL, middleware, Next-конфиг и клиентские hooks. Ссылки ниже — реальные файлы и строки на момент аудита. Ничего не меняли.

---

## 1. Hot-path: чат и «матчи» (самое дорогое из найденного)

### 1.1 Критично: polling каждые 3–5 секунд по всему mini app

`apps/web/app/m/_lib/queries.ts:113` — `useMatches({ refetchInterval: 5000 })`
`apps/web/app/m/_lib/queries.ts:123` — `useMessages({ refetchInterval: 3000 })`

Каждая открытая вкладка mini-app бьёт:

- `GET /match-api/matches` каждые 5 сек,
- `GET /match-api/matches/:pairId/messages` каждые 3 сек, если юзер внутри чата.

Проблема не в частоте самой по себе (Telegram mini-app всё равно живёт недолго на сессию), а в том, что на бэке `getMatches` сам по себе дорогой (см. §1.2). При 100 активных вкладках это ~20 RPS на один только matches-эндпоинт «в покое».

**Правка:** как минимум — уважать `document.visibilityState` (`refetchInterval: (query) => (document?.visibilityState === 'visible' ? 5000 : false)`), увеличить период (matches — 15 с, messages — 5 с) и включить `refetchOnWindowFocus: true` для быстрой синхронизации при возврате во вкладку.
**Эффект:** фон нагрузки −50–70%, батарея мобильных. Риск: low.
**Структурно (P2):** SSE/WebSocket для messages — один push за match вместо poll.

### 1.2 Критично: `getMatches` тянет все сообщения по всем парам без лимита

`apps/api/src/modules/match/swipe.service.ts:498-583` (метод `getMatches`). В блоке 523-526:

```ts
this.prisma.matchMessage.findMany({
  where: { pairId: { in: pairIds } },
  orderBy: [{ pairId: 'asc' }, { createdAt: 'desc' }],
}),
```

Нет `take`. При 50 матчей × 100 сообщений — 5000 строк, и это вытаскивается каждые 5 секунд polling'ом. Реально нужно: последнее сообщение на пару + unread count.

**Правка:** разбить на два запроса или заменить на `$queryRaw`:

```sql
-- last message per pair (Postgres 13+: DISTINCT ON)
SELECT DISTINCT ON ("pairId") *
FROM "MatchMessage"
WHERE "pairId" = ANY($1::text[])
ORDER BY "pairId", "createdAt" DESC;

-- unread count per pair одним groupBy с join к MatchPairRead
```

**Эффект:** p95 на /matches падает с секунд на десятки мс, память в Node меньше на порядок.
**Риск:** med (поменяется shape ответа — проверить фронт; но фронт использует только `lastMessage` и агрегаты).

### 1.3 Серьёзно: `notifyIncomingLike` и `notifyNewMatch` — `await` в hot path свайпа

`apps/api/src/modules/match/swipe.service.ts:290-292, 308-320`. После успешной транзакции свайпа идёт `await this.notifyIncomingLike(...)`, а при матче — `await this.notifyNewMatch(...)` (который сам делает `Promise.all` на двух получателей).

Telegram bot API может легко занять 300–2000 мс. Пока POST /swipe ждёт, у пользователя «залипает» следующий свайп в интерфейсе. Отправка уведомления не критична для ответа клиенту — клиенту важен только `{ matched, pairId, partner }`.

**Правка:**

```ts
void this.notifyIncomingLike(toProfile.user.telegramId).catch((err) =>
  this.logger.warn(`notify incoming like failed: ${err}`),
);
```

Аналогично для `notifyNewMatch`. `eventLogger.log` уже сделан fire-and-forget через `void` — повторить паттерн.
**Эффект:** p95 /swipe −500 мс на типичной сети. Риск: low.

---

## 2. Feed (свайп-лента)

### 2.1 Критично: `ORDER BY random()` на всём отфильтрованном наборе

`apps/api/src/modules/match/feed.service.ts:194` — `ORDER BY score DESC, random()`
`apps/api/src/modules/match/feed.service.ts:256` — `ORDER BY random()` (fallback без ranking).

Postgres обязан посчитать `random()` для каждой строки результата, отсортировать весь набор, и только затем применить `LIMIT 20`. Для 1k профилей терпимо, для 10k — несколько сотен мс, для 100k — секунды.

**Правка (короткий путь):** заменить на детерминированный ORDER BY score + id с курсорной пагинацией:

```sql
ORDER BY score DESC, p.id
LIMIT ${limit}
-- опционально: AND (score, p.id) < ($cursorScore, $cursorId)
```

«Случайность» между сессиями получается сама — новый набор входа (новые свайпы, новый score) сдвигает ленту.

**Промежуточно:** `TABLESAMPLE SYSTEM (10)` как оболочка перед WHERE — фильтровать не всю таблицу, а ~10%.
**Структурно (P2):** материализованный view `match_feed_mv` с пересчётом score каждые 5–15 мин + reservoir-sampling на уровне Postgres.
**Эффект:** p95 /feed падает в 5–20× на больших базах. Риск: med (может поменяться ощущение «свежести» ленты — стоит A/B).

### 2.2 Серьёзно: отдельный запрос на фото после $queryRaw

`apps/api/src/modules/match/feed.service.ts:261-268` — второй round-trip `matchProfilePhoto.findMany({ where: { profileId: { in: profileIds } } })`. Это не N+1 (батч), но +1 запрос на весь feed.

**Правка:** встроить в основной `$queryRaw` через `jsonb_agg`:

```sql
, COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object('id', ph.id, 'url', ph.url, 'order', ph.order)
      ORDER BY ph.order
    )
    FROM "MatchProfilePhoto" ph
    WHERE ph."profileId" = p.id),
    '[]'::jsonb
  ) AS photos
```

**Эффект:** −1 RTT (5–20 мс на локалке, больше при удалённой БД). Риск: low.

### 2.3 Серьёзно: нет частичного индекса под hot-фильтр активных профилей

`packages/db/prisma/schema.prisma:134-137` — отдельные индексы `[role]`, `[isActive]`, `[lastActiveAt]`, `[pausedUntil]`. Но feed-запрос всегда фильтрует комбинацию: `isActive = true AND bannedAt IS NULL AND shadowBanned = false AND (pausedUntil IS NULL OR pausedUntil <= now())`. Planner выберет один из одиночных индексов + BitmapAnd, что неплохо, но **partial index** был бы на порядок компактнее:

```sql
CREATE INDEX CONCURRENTLY idx_mprofile_feed_candidates
  ON "MatchProfile" ("lastActiveAt" DESC)
  WHERE "isActive" = true AND "bannedAt" IS NULL AND "shadowBanned" = false;
```

**Эффект:** feed scan на порядок быстрее при большой базе. Риск: low (concurrently).

### 2.4 Замечание: `NOT EXISTS` на MatchSwipe покрыт — ок

`feed.service.ts:188-193` использует `NOT EXISTS (SELECT 1 FROM MatchSwipe sw WHERE sw.fromProfileId = me AND sw.toProfileId = p.id)`. Unique `@@unique([fromProfileId, toProfileId])` в `schema.prisma:163` уже создал индекс — планировщику достаточно. Ничего менять не нужно.

---

## 3. API: middleware, Prisma, sharp

### 3.1 Критично: `apps/api/src/main.ts` без compression / helmet / throttler

`apps/api/src/main.ts:8-35` — базовый bootstrap: CORS, ValidationPipe, express.static для медиа. **Нет**: `compression`, `helmet`, `@nestjs/throttler`. На мобильной сети отсутствие gzip ощутимо — типичный `/matches` ответ 20–80 кБ сжимается в 5–15 кБ.

**Правка:**

```ts
import compression from 'compression';
import helmet from 'helmet';
app.use(helmet({ contentSecurityPolicy: false })); // CSP настраивается отдельно
app.use(compression({ level: 6 }));
```

Throttler — отдельно для `/match-admin/auth/login` (brute-force) и `/match-api/swipe` (ограничение spam).
**Эффект:** bytes-on-wire −60–80% на тексте, TTI быстрее. Риск: low.

### 3.2 Серьёзно: `PrismaService` без параметров пула и без логов

`apps/api/src/prisma/prisma.service.ts:1-16` — голый `extends PrismaClient`, без `log`, без `datasources`. По умолчанию Prisma пул = `num_cpus * 2 + 1`. На маленькой VPS это 5–9 коннектов — упрётся уже на нескольких параллельных запросах (особенно с тяжёлым `$queryRaw` в feed + polling matches).

**Правка:** задать `DATABASE_URL=...?connection_limit=15&pool_timeout=10` и (опционально) pgbouncer в transaction mode + `?pgbouncer=true` в URL.
**Эффект:** уход от серийных таймаутов под пиками; предсказуемая latency.
**Риск:** low (конфиг, не код).

Для наблюдаемости (опционально) — `log: [{ emit: 'event', level: 'query' }]` + лёгкий обработчик duration в proc-metrics по env-флагу. Пример есть в соседнем проекте `telegram-trends` (режимы `off|lite|full`).

### 3.3 Замечание: `compressImage` с sharp — циклом до 3 прогонов

`apps/api/src/modules/match/photos.service.ts:34-46` — если первое прохождение с `quality: 82` даёт файл больше 2 МБ, sharp гоняет ещё с 70 и 60. Это 200–600 мс/фото в event loop. Не страшно (upload и так редкий), но для страховки — sharp по умолчанию пускает работу в thread pool; убедиться, что `UV_THREADPOOL_SIZE` >= 4 на проде, иначе параллельные аплоады выстроятся в очередь.

### 3.4 Серьёзно: `maybeAutoCatchupReset` может срабатывать в hot path auth

`apps/api/src/modules/match/swipe.service.ts:486-495` + предположительно вызов из `match-auth.guard.ts`. Функция делает `deleteMany` + `update` в транзакции, если пользователь был неактивен `MATCH_AUTO_RESET_INACTIVITY_THRESHOLD_DAYS` дней. Запускается **внутри guard** при первом запросе после возвращения. Для старого профиля с 10k PASS-свайпов это может занять секунды и блокировать auth.

**Правка:** планировать reset в фон (сделать `void` + перенести в `match-admin-cron.service.ts` как батч-процесс «откатиться по всем неактивным»). В guard — только пометить, а чистить асинхронно.
**Риск:** med (нужно убедиться, что фронт адекватно показывает «ваши свайпы обновляются»).

---

## 4. Frontend (apps/web)

### 4.1 Критично: Telegram SDK с `strategy="beforeInteractive"`

`apps/web/app/m/layout.tsx:28-31` — `<Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />`. Это блокирует парсинг HTML до загрузки скрипта. На 3G/Mobile Edge разница может быть 300–1500 мс на LCP.

SDK нужен для `Telegram.WebApp.ready()`, `initData`, кнопок `web_app` — это всё после первого рендера. Безопасно перевести на `afterInteractive` (или `lazyOnload`) с проверкой `typeof window.Telegram !== 'undefined'` в обработчиках.

**Правка:**

```tsx
<Script
  src="https://telegram.org/js/telegram-web-app.js"
  strategy="afterInteractive"
/>
```

+ в компоненте, где вызывается `Telegram.WebApp.ready()`, подождать через `useEffect` и интервальный опрос/event.
**Эффект:** LCP −300…−1500 мс на мобильных. Риск: med (важно не делать `initData`-операции до `ready()`).

### 4.2 Серьёзно: `providers.tsx` — всё приложение под `'use client'`

`apps/web/app/providers.tsx:1` и `apps/web/app/layout.tsx` — `Providers` это `'use client'` с React Query. Вместе с `m/layout.tsx` (тоже `'use client'`) и `BottomTabs` — весь mini-app клиентский. Для Telegram mini-app это окей (всё равно фактически SPA), но SSR для `/` и `/admin/*` теряется зря.

**Правка:** оставить `Providers` client-only (React Query требует), но перенести обёртку в отдельный компонент только для `/m/*`. Корневой `app/layout.tsx` — без клиента, сохранит SSR на публичных страницах.
**Эффект:** LCP для admin и landing −100…−200 мс. Риск: med.

### 4.3 Серьёзно: React Query `staleTime: 30_000` глобально

`apps/web/app/providers.tsx:12-15`. Глобальный `staleTime = 30 с` борется с polling'ом из §1.1: после `refetchInterval: 3000` данные считаются stale лишь спустя 30 с, но sure-next-interval уже прошёл, и refetch всё равно запустится. Эффект на рендере минимальный, но semantic mismatch.

**Правка:** оставить глобал 30 с, но явно задать per-query:

```ts
// queries.ts
useMessages(pairId) // staleTime: 2_000
useMatches()        // staleTime: 3_000
useProfile()        // staleTime: 5 * 60_000
useFeed()           // staleTime: 0 (инвалидируется на каждом свайпе)
```

### 4.4 Замечание: `next.config.ts` почти пустой

`apps/web/next.config.ts:1-15` — только rewrites на `/match-api`. Нет:

- `experimental.optimizePackageImports` для `lucide-react`, `@tanstack/react-query`, `zustand`, `@dnd-kit/*` (пакеты большие, у lucide удобное modular tree-shaking);
- `compiler.removeConsole` для prod;
- `images` (если планируется `next/image` для фото).

**Правка:**

```ts
experimental: {
  optimizePackageImports: [
    'lucide-react',
    '@tanstack/react-query',
    'zustand',
    '@dnd-kit/core',
    '@dnd-kit/sortable',
    '@dnd-kit/utilities',
  ],
},
compiler: {
  removeConsole: process.env.NODE_ENV === 'production'
    ? { exclude: ['error', 'warn'] } : false,
},
```

**Эффект:** bundle −30…−80 кБ gzip на main. Риск: low.

### 4.5 Замечание: `browser-image-compression` и `@dnd-kit/*` — проверить, где импортятся

Компрессия фото нужна только на `/m/profile` при загрузке; dnd-kit — тоже только там. Если они попали в bundle у `/m/feed` — это лишние 40–80 кБ JS. Проверить через `next build` и (если нужно) обернуть в `dynamic(() => import(...), { ssr: false })`.

---

## 5. Сводная матрица

| # | Правка | Файл | Эффект | Риск | Время |
|---|--------|------|--------|------|-------|
| **P0-1** | Уважать visibility в polling matches/messages, поднять период | `web/app/m/_lib/queries.ts:113,123` | API RPS −50%, батарея | low | 10 мин |
| **P0-2** | `void notifyIncomingLike/notifyNewMatch` | `api/src/modules/match/swipe.service.ts:290,308` | p95 /swipe −500 мс | low | 10 мин |
| **P0-3** | `compression` + `helmet` в Nest | `api/src/main.ts:9-28` | bytes-on-wire −60% | low | 10 мин |
| **P0-4** | `connection_limit=15` в DATABASE_URL | env | стабильность под пиками | low | 5 мин |
| **P0-5** | Telegram SDK → `afterInteractive` | `web/app/m/layout.tsx:28-31` | LCP −500 мс моб. | med | 15 мин |
| **P1-1** | `getMatches` — last-message через DISTINCT ON + unread groupBy | `api/src/modules/match/swipe.service.ts:498-583` | p95 /matches в 10× | med | 1 ч |
| **P1-2** | Фото в feed через `jsonb_agg` в основном $queryRaw | `api/src/modules/match/feed.service.ts:261-268` | −1 RTT | low | 30 мин |
| **P1-3** | Partial index на MatchProfile | `packages/db/prisma/schema.prisma:82-137` | feed scan × | low | 30 мин + migrate |
| **P1-4** | Per-query `staleTime` в React Query | `web/app/m/_lib/queries.ts` | согласованность | low | 20 мин |
| **P1-5** | `optimizePackageImports` + `removeConsole` | `web/next.config.ts` | bundle −30…−80 кБ | low | 10 мин |
| **P1-6** | `maybeAutoCatchupReset` в фон | `api/src/modules/match/swipe.service.ts:486-495` + guard | auth без spikes | med | 1–2 ч |
| **P2-1** | Заменить `ORDER BY random()` на курсор/материализованный view | feed.service | p95 /feed × | med–high | 4–8 ч |
| **P2-2** | SSE/WebSocket для чата | api + web | убирает polling совсем | high | 1–2 дня |
| **P2-3** | Next `compiler.removeConsole`, лёгкий Prisma log-lite | web + api | наблюдаемость без оверхеда | low | 1 ч |

---

## 6. Что делать сначала (план на 1–2 часа)

1. 5 правок P0 одной серией — вся первая колонка матрицы. Базово это 50 минут + перетест. Измерить до/после: Lighthouse на `/m` + fake-slow-3G; `ab` / `k6` по `/match-api/matches` (если есть бенчмарк-профиль).
2. P1-1 и P1-2 — отдельным PR под миграцию запроса; прогнать `pnpm --filter @match/api test` (есть `swipe.service.spec.ts` — при его наличии), + руками в /m/matches.
3. P1-3 — отдельным PR с миграцией Prisma. Deploy в прод-окно, смотреть `pg_stat_statements`.

Дальше — по плану; P2 делается, когда будет бюджет.

---

## 7. Что я не проверил глубоко (можно дожать отдельно)

- Админка `/admin/match/*` — запросы-пагинации, react-query по auditlog/spam; вероятно, там тоже polling где-то.
- `chat.service.ts` — не проверял; стоит убедиться, что в `sendMessage` не идёт синхронный push через Telegram bot API (как в swipe.service).
- `match-admin-cron.service.ts` — какие крон-задачи, нет ли перекрытия с рантаймом.
- `match-auth.service.ts` — кешируется ли проверка `initData` (`@tma.js/init-data-node` криптографически тяжёлая, если звать на каждый запрос — ощутимо).
- `eventLogger.service.ts` — куда пишет, не раздувается ли таблица `MatchEventLog` (индексы есть: `[type, createdAt]`, `[profileId, createdAt]` — хорошо).

Если нужно — дай знать и пройдусь по этим пунктам.
