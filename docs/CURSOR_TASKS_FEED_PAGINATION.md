# Match-app — Пагинация ленты свайпов

> Задача для Cursor. Цель — починить баг «колода заканчивается через 20 свайпов, но после ухода в другой пункт меню и возврата в ленту появляются новые карточки».

---

## Контекст и симптомы

- Пользователь свайпает 20 карт подряд → экран мгновенно уходит в «Карточки закончились» (`apps/web/app/m/feed/page.tsx:244-253`).
- Если пользователь переходит в другой таб (профиль / матчи / настройки) и возвращается в ленту — появляются «новые» карточки.
- На самом деле «новые» — это в большинстве случаев либо следующая страница подходящих профилей, либо тот же пул, которому сбросили историю свайпов через auto-reset (`profile.service.ts:473-506`, флаг `MATCH_AUTO_SWIPE_RESET`, `lastResetTriggeredBy === 'auto' | 'auto_catchup'`).

## Корень проблемы

### 1. На бэкенде нет пагинации

`apps/api/src/modules/match/feed.service.ts:14-28`

```ts
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
...
async getFeed(profileId: string, rawLimit?: number) {
  ...
  const limit = Math.min(Math.max(rawLimit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  ...
  // ORDER BY score DESC, p.id
  // LIMIT ${limit}
}
```

Нет ни `offset`, ни курсора. Всегда отдаётся топ-N по `score DESC, p.id` (или `lastActiveAt DESC, p.id` в not-ranked-ветке). Контроллер тоже принимает только `limit`:

`apps/api/src/modules/match/match.controller.ts:110-116`

```ts
@Get('feed')
@UseGuards(MatchAuthGuard)
getFeed(@Req() req: MatchRequest, @Query('limit') limitRaw?: string) {
  const profileId = this.requireProfileId(req);
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  return this.feedService.getFeed(profileId, limit);
}
```

### 2. На фронте нет логики «подгрузить, когда колода подходит к концу»

- `apps/web/app/m/_lib/api.ts:684` — `feed(limit = 20)`.
- `apps/web/app/m/_lib/queries.ts:27-34` — `useMatchFeed(20)` обычным `useQuery`.
- `apps/web/app/m/_lib/store.ts:27-28` — `setFeed` **затирает** массив, `popFeedTop` режет верхний элемент. Накопления нет.
- `apps/web/app/m/feed/page.tsx:74-76` — `useEffect` просто делает `setFeed(feedData)` при каждом изменении `feedData`.
- `apps/web/app/m/_components/SwipeStack.tsx` — никаких триггеров «рядом с концом колоды».

### 3. Invalidate после каждого свайпа провоцирует затирание

`apps/web/app/m/_lib/queries.ts:36-49`

```ts
export function useSwipeMutation() {
  ...
  onSuccess: () => {
    void qc.invalidateQueries({ queryKey: matchKeys.feed });
    ...
  },
}
```

После каждого свайпа стартует рефетч `/match-api/feed?limit=20`, который снова возвращает топ-20 из оставшихся. Когда оставшихся меньше 20 — бэк отдаёт меньше (в пределе `[]`), `setFeed([])` затирает стор, и экран переключается в «Карточки закончились». Механизм auto-reset срабатывает на путях вокруг `me`/mount, а не по каждому свайпу, — поэтому визуально «спасает» только переход в другой таб и обратно.

---

## P1 — Основной фикс (обязательно)

### 1.1 Бэкенд: добавить `offset` (курсор-пагинацию оставим как опцию на будущее)

**Файл:** `apps/api/src/modules/match/feed.service.ts`

1. Расширить сигнатуру `getFeed`:
   ```ts
   async getFeed(profileId: string, rawLimit?: number, rawOffset?: number) {
     const me = await this.profileService.requireProfileById(profileId);
     const limit = Math.min(Math.max(rawLimit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
     const offset = Math.max(rawOffset ?? 0, 0);
     ...
   }
   ```
2. В обоих SQL-ветках (ranked и not-ranked) дописать `OFFSET ${offset}` после `LIMIT ${limit}`. Сортировка уже детерминирована (`score DESC, p.id` и `lastActiveAt DESC, p.id`) — страницы будут стабильны между запросами.
3. Вернуть в ответе не массив, а объект с метаданными:
   ```ts
   return {
     items: rows.map(...),            // то, что возвращалось раньше
     nextOffset: rows.length === limit ? offset + rows.length : null,
     hasMore: rows.length === limit,
   };
   ```
   ⚠️ Это ломает форму ответа. Сразу поправь всех потребителей (см. 1.2 и 1.3).
4. Обнови `apps/api/src/modules/match/feed.service.spec.ts` — теперь ожидается `{ items, nextOffset, hasMore }`.

**Файл:** `apps/api/src/modules/match/match.controller.ts:110-116`

```ts
@Get('feed')
@UseGuards(MatchAuthGuard)
getFeed(
  @Req() req: MatchRequest,
  @Query('limit') limitRaw?: string,
  @Query('offset') offsetRaw?: string,
) {
  const profileId = this.requireProfileId(req);
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : undefined;
  return this.feedService.getFeed(profileId, limit, offset);
}
```

### 1.2 Фронт: API-клиент

**Файл:** `apps/web/app/m/_lib/api.ts:684`

```ts
export type FeedPage = {
  items: FeedCard[];
  nextOffset: number | null;
  hasMore: boolean;
};

feed(limit = 20, offset = 0): Promise<FeedPage> {
  if (isLocalDemoMode()) {
    const filtered = LOCAL_DEMO_FEED.filter((card) => !localSwipedIds.has(card.id));
    const items = filtered.slice(offset, offset + limit);
    return Promise.resolve({
      items,
      nextOffset: offset + items.length < filtered.length ? offset + items.length : null,
      hasMore: offset + items.length < filtered.length,
    });
  }
  return matchFetch<FeedPage>(`/match-api/feed?limit=${limit}&offset=${offset}`);
},
```

Не забудь экспортировать тип `FeedPage` — он понадобится стору и queries.

### 1.3 Фронт: `useInfiniteQuery`

**Файл:** `apps/web/app/m/_lib/queries.ts`

Заменить `useMatchFeed` на infinite-вариант:

```ts
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { FeedPage } from './api';

export function useMatchFeed(limit = 20) {
  return useInfiniteQuery({
    queryKey: [...matchKeys.feed, limit],
    initialPageParam: 0,
    queryFn: ({ pageParam = 0 }) => matchApi.feed(limit, pageParam as number),
    getNextPageParam: (last: FeedPage) => last.nextOffset,
    staleTime: 0,
    retry: 0,
  });
}
```

⚠️ `useSwipeMutation` (строки 36-49) больше **не должен** инвалидировать `matchKeys.feed` после каждого свайпа — это главная причина «залипания» на пустой колоде. Оставь инвалидацию только в:

- `useUndoSwipeMutation` — там это корректно (undo должен вернуть верхнюю карту).
- `useSwipeResetMutation` — тоже корректно (глобальный сброс).

В `useSwipeMutation` инвалидацию фида **удалить**. Инвалидировать `matchKeys.me`, `matchKeys.matches`, `matchKeys.favorites`, `matchKeys.swipeResetPreview` — оставить как есть.

### 1.4 Zustand store: не затирать, а дописывать

**Файл:** `apps/web/app/m/_lib/store.ts`

```ts
type MatchUiState = {
  ...
  setFeed: (feed: FeedCard[]) => void;       // оставляем для reset/undo
  appendFeed: (cards: FeedCard[]) => void;   // новое
  popFeedTop: () => void;
  ...
};

export const useMatchStore = create<MatchUiState>((set) => ({
  ...
  setFeed: (feed) => set({ feed }),
  appendFeed: (cards) =>
    set((state) => {
      if (!cards.length) return state;
      const seen = new Set(state.feed.map((c) => c.id));
      const add = cards.filter((c) => !seen.has(c.id));
      if (!add.length) return state;
      return { feed: [...state.feed, ...add] };
    }),
  popFeedTop: () => set((state) => ({ feed: state.feed.slice(1) })),
  ...
}));
```

### 1.5 Feed page: accumulate + prefetch-at-near-end

**Файл:** `apps/web/app/m/feed/page.tsx`

Заменить текущий хендлинг:

```tsx
const { data: feedData, isLoading: feedLoading } = useMatchFeed(20);
...
useEffect(() => {
  if (feedData) setFeed(feedData);
}, [feedData, setFeed]);
```

на:

```tsx
const {
  data: feedData,
  isLoading: feedLoading,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useMatchFeed(20);

const { feed, setFeed, appendFeed, popFeedTop, ... } = useMatchStore();

// Сбрасываем stor при первой странице и докидываем остальные (без затираний).
const lastSeenPageCountRef = useRef(0);
useEffect(() => {
  if (!feedData) return;
  const pages = feedData.pages;
  if (pages.length === 1 && lastSeenPageCountRef.current === 0) {
    // первый заход: устанавливаем ровно первую страницу
    setFeed(pages[0].items);
  } else if (pages.length > lastSeenPageCountRef.current) {
    // пришла новая страница: аккуратно дописываем
    const newPages = pages.slice(lastSeenPageCountRef.current);
    for (const p of newPages) appendFeed(p.items);
  }
  lastSeenPageCountRef.current = pages.length;
}, [feedData, setFeed, appendFeed]);

// Prefetch-at-near-end: когда в локальной колоде осталось ≤3 карты —
// просим следующую страницу. Триггеримся на изменение feed.length.
const PREFETCH_THRESHOLD = 3;
useEffect(() => {
  if (feed.length > PREFETCH_THRESHOLD) return;
  if (!hasNextPage) return;
  if (isFetchingNextPage) return;
  void fetchNextPage();
}, [feed.length, hasNextPage, isFetchingNextPage, fetchNextPage]);
```

Условие `!topCard` (строка 244) оставляем — но теперь оно сработает только когда бэк реально вернул `hasMore = false` и локальная колода опустела. Чтобы не моргать «Карточки закончились» во время фоновой подгрузки, покажи спиннер вместо пустого состояния:

```tsx
{!topCard && isFetchingNextPage ? (
  <div className="flex min-h-[56vh] items-center justify-center">
    <div className="ios-spinner" aria-label="Загрузка" />
  </div>
) : !topCard ? (
  // текущий блок «Карточки закончились» без изменений
  ...
) : null}
```

### 1.6 Undo и reset — не сломать

**Файл:** `apps/web/app/m/_lib/queries.ts`

- `useUndoSwipeMutation` и `useSwipeResetMutation` должны инвалидировать `matchKeys.feed` **полностью** (чтобы infinite-query сбросил все страницы и начал с `offset=0`). Достаточно того, что уже есть (`invalidateQueries({ queryKey: matchKeys.feed })`), но после invalidate нужно сбросить `lastSeenPageCountRef` и локальный стор:

В `feed/page.tsx` добавь эффект, который слушает изменение «идентичности» первой страницы и ресетит `lastSeenPageCountRef.current = 0` + `setFeed([])` перед применением новой первой страницы (иначе останутся старые дубли после undo/reset). Простое решение — обнулять при смене длины `pages` вниз:

```tsx
useEffect(() => {
  if (!feedData) return;
  if (feedData.pages.length < lastSeenPageCountRef.current) {
    lastSeenPageCountRef.current = 0;
    setFeed([]);
  }
}, [feedData, setFeed]);
```

---

## P2 — Полировка

### 2.1 Гонка: параллельные свайпы + только что пришедшая страница

Если пользователь свайпает быстро и в момент прихода следующей страницы локально уже `popFeedTop`-нута карточка из предыдущей — новая страница **не должна** вернуть ту, которую только что свайпнули. Бэк уже фильтрует через `NOT EXISTS MatchSwipe`, но учти: `offset` на следующей странице **сдвигается** ровно на `limit`, а из-за удалений (MatchSwipe создаётся между первой и второй страницей) элементы могут «съехать» и первая карточка второй страницы окажется дублем. Защита — дедупликация по `id` в `appendFeed` (уже есть в 1.4) и, в идеале, курсорная пагинация вместо `OFFSET`.

Опционально: перейди на курсор `(score, id)` вместо `offset`. Но можно оставить на потом.

### 2.2 `staleTime`

Сейчас `staleTime: 0` заставляет React Query рефетчить при каждом mount. После этой задачи это менее критично, но всё равно оставь — иначе после возврата из другого таба не сработает auto-reset-эффект (который пользователю фактически полезен).

### 2.3 Локальный demo-режим

В `api.ts` демо-ветке (`isLocalDemoMode()`) уже корректно поддерживается `offset` (см. 1.2). Проверить, что экран «Карточки закончились» в demo-режиме всё ещё достижим.

---

## P3 — Тесты

### 3.1 Бэкенд

**Файл:** `apps/api/src/modules/match/feed.service.spec.ts`

- Существующий тест `getFeed('me', 20)` теперь должен проверять `result.items.length === 1` и `result.hasMore === false` (для одной строки).
- Добавить кейс: мок возвращает 20 строк → `hasMore === true`, `nextOffset === 20`.
- Добавить кейс: `getFeed('me', 20, 20)` — проверить, что в SQL-mock прокидывается `OFFSET 20`.

### 3.2 Фронт

- Smoke-тест в `feed/page.tsx`: в моке api — две страницы по 20. Прокликиваем 18 свайпов (не доходя до 3 оставшихся), ждём один `fetchNextPage`. Колода после 18 свайпов должна содержать 20 (2 остатка от первой + 18 новых из второй после вычитания).
- Проверить, что Undo возвращает верхнюю карту и не дублирует элементы.

---

## Acceptance criteria

1. Пользователь может свайпнуть **больше 20** карт подряд без пустого экрана, пока в пуле реально есть подходящие.
2. Экран «Карточки закончились» появляется **только когда** бэк вернул `hasMore: false` и локальная колода пуста.
3. Переход в другой таб и возврат **не обязателен** для продолжения ленты (но после ручного `SwipeReset` или auto-reset корректно показывает новые карты).
4. В DevTools Network: после каждого свайпа **нет** нового запроса `/match-api/feed` (инвалидация убрана из `useSwipeMutation`). Запрос появляется только при `fetch-next-page` (когда в колоде ≤3 карты) и при undo/reset.
5. После Undo верхняя карта возвращается без визуальных дублей.
6. Существующие тесты проходят, новые добавлены.

---

## Файлы к изменению — чек-лист

- [ ] `apps/api/src/modules/match/feed.service.ts` — `offset`, новый формат ответа `{ items, nextOffset, hasMore }`
- [ ] `apps/api/src/modules/match/match.controller.ts` — `@Query('offset')`
- [ ] `apps/api/src/modules/match/feed.service.spec.ts` — обновить ожидания, добавить кейсы
- [ ] `apps/web/app/m/_lib/api.ts` — `FeedPage`, `feed(limit, offset)`
- [ ] `apps/web/app/m/_lib/queries.ts` — `useInfiniteQuery`, **убрать** invalidate фида из `useSwipeMutation`
- [ ] `apps/web/app/m/_lib/store.ts` — `appendFeed` с дедупликацией
- [ ] `apps/web/app/m/feed/page.tsx` — accumulate + prefetch при `feed.length ≤ 3` + спиннер при `isFetchingNextPage`
- [ ] (опц.) smoke-тест на прокликивание 18 свайпов и триггер следующей страницы

## Чего не делать

- Не просто поднимать `DEFAULT_LIMIT` с 20 до 50 — это косметическая отсрочка, баг останется.
- Не трогать `maybeAutoResetOnActivity` / `resetInternal` в `profile.service.ts` и `swipe.service.ts` — это отдельная механика, не источник текущего бага.
- Не убирать `staleTime: 0` — auto-reset-баннер зависит от свежего `me` при возврате на экран.
