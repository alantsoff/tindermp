# Match-app — «Избранное» для лайкнутых профилей

> Задача для Cursor. P0-блок — уже в коде, **не откатывать**. P1–P3 — твои шаги.

---

## P0 — что уже сделано (проверить, не править)

### Бизнес-правило

- Любой LIKE из ленты автоматически попадает в «Избранное» пользователя.
- Как только партнёр отвечает взаимным лайком — пара переходит в «Матчи», а из «Избранного» пропадает (клиент просто перестаёт её получать, исходная запись в `MatchSwipe` остаётся).
- Повторный Undo/unlike удаляет запись `MatchSwipe`, и профиль снова появляется в ленте.

### Бэкенд

**`apps/api/src/modules/match/swipe.service.ts`**

- `getFavorites(profileId)` возвращает массив `FavoriteItem` — LIKE-свайпы текущего пользователя, у которых **нет** ответного LIKE от партнёра. Фильтр:
  ```ts
  NOT: {
    toProfile: {
      swipesFrom: { some: { toProfileId: profileId, direction: 'LIKE' } },
    },
  }
  ```
  Возвращает в том числе `isSuperLike`, `likedAt`, `isAvailable` (не забанен и не на паузе), первое фото/аватар. Лимит 200, порядок — `createdAt desc`.
- `removeFavorite(profileId, toProfileId)` — `deleteMany` на LIKE-свайп. При отсутствии записи → `NotFoundException('favorite_not_found')`.

**`apps/api/src/modules/match/match.controller.ts`**

```
GET    /match-api/favorites                    → getFavorites
DELETE /match-api/favorites/:toProfileId       → removeFavorite
```

### Фронт

**`apps/web/app/m/_lib/api.ts`**

- `matchApi.favorites()` / `matchApi.removeFavorite(toProfileId)`
- Экспортирован тип `FavoriteItem`

**`apps/web/app/m/_lib/queries.ts`**

- `matchKeys.favorites = ['match', 'favorites']`
- `useFavorites()`, `useRemoveFavorite()`
- **Важно:** `useSwipeMutation` и `useUndoSwipeMutation` теперь инвалидируют `matchKeys.favorites`. Не убирать — иначе список будет устаревать.

**`apps/web/app/m/favorites/page.tsx`** — новая страница:
- Back-button → `router.back()`
- iOS-список `ios-group` с аватаром, displayName, role, city, headline, `formatRelativeShort(likedAt)`
- Super-like бейдж с иконкой Sparkles, бейдж «недоступен» если `!isAvailable`
- Красная круглая кнопка-trash, вызывает `removeFavorite.mutateAsync(partner.id)`
- Пустое состояние: сердце + ссылка «Открыть ленту»

**`apps/web/app/m/profile/page.tsx`** — карточка-ссылка «Избранное» между секциями «Кого ищу» и «Фото профиля». Розовое сердечко-иконка (`ios-pink/0.16`), склонение счётчика, `ChevronRight` справа.

---

## P1 — follow-up

### 1.1 Защита: не позволить unlike партнёра, с которым уже матч

**Файл:** `apps/api/src/modules/match/swipe.service.ts` — `removeFavorite(...)`

Сейчас метод `deleteMany` сработает даже если между нами уже есть `MatchPair` (мы просто не увидим такого в UI, но прямой вызов API это позволяет). Добавь guard:

```ts
const mutual = await this.prisma.matchSwipe.findUnique({
  where: {
    fromProfileId_toProfileId: {
      fromProfileId: toProfileId,
      toProfileId: profileId,
    },
  },
  select: { direction: true },
});
if (mutual?.direction === 'LIKE') {
  throw new BadRequestException('favorite_is_match');
}
```

Клиент при ошибке `favorite_is_match` должен показать тост «Этот контакт уже в матчах».

### 1.2 Оптимистичное удаление

**Файл:** `apps/web/app/m/_lib/queries.ts`

Сейчас после клика кнопка ждёт ответ сервера и потом рефетчит список. Добавь optimistic update:

```ts
export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toProfileId: string) => matchApi.removeFavorite(toProfileId),
    onMutate: async (toProfileId) => {
      await qc.cancelQueries({ queryKey: matchKeys.favorites });
      const prev = qc.getQueryData<FavoriteItem[]>(matchKeys.favorites);
      qc.setQueryData<FavoriteItem[]>(
        matchKeys.favorites,
        (old) => (old ?? []).filter((item) => item.partner.id !== toProfileId),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(matchKeys.favorites, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: matchKeys.favorites });
      void qc.invalidateQueries({ queryKey: matchKeys.feed });
    },
  });
}
```

Тип `FavoriteItem` импортировать из `./api`.

### 1.3 Показать счётчик в preview-карточке на `/m/profile`

Сейчас `favoritesCount` считается по `favorites?.length ?? 0`, а у `useFavorites()` `retry: 0`. Этого достаточно, но добавь skeleton-состояние когда `isLoading === true`:

```tsx
const { data: favorites, isLoading: favoritesLoading } = useFavorites();
...
{favoritesLoading ? (
  <div className="h-[56px] animate-pulse rounded-xl bg-[rgb(var(--ios-fill-1)/0.14)]" />
) : (
  /* существующая карточка */
)}
```

### 1.4 Push/in-app уведомление о новых лайках

В бэкенде уже есть `sendPendingLikesPing` — он шлёт Telegram-сообщение «N человек лайкнули вас» раз в 6 часов. Это про **входящие** лайки, не про моё избранное. Ничего делать не надо, просто проверь, что текст в сообщении правильно ведёт на `/m/feed` (не на `/m/favorites`) — человек должен идти смотреть новые карточки, а не своё избранное.

---

## P2 — тесты

### 2.1 Юнит-тест `getFavorites`

**Файл:** `apps/api/src/modules/match/swipe.service.spec.ts` — дополнить.

Покрыть сценарии:
- один односторонний LIKE → попадает в ответ
- взаимный LIKE (мой + его) → **не** попадает в ответ
- PASS → не попадает
- SUPER_LIKE → попадает с `isSuperLike: true`
- забаненный партнёр → попадает с `isAvailable: false`

### 2.2 Юнит-тест `removeFavorite`

- удалит единственную LIKE-запись → `removed === 1`
- если записи нет → `NotFoundException('favorite_not_found')`
- после fix из 1.1: если пара уже матч → `BadRequestException('favorite_is_match')`

---

## P3 — UX-улучшения (необязательно)

### 3.1 Поиск по избранному

Когда список > 10, добавить `<input>` с фильтрацией по `displayName`, `role`, `niches` — по тем же правилам, что в `/m/matches`.

### 3.2 Секция «Вы лайкнули (всего за неделю)» на `/m/profile`

Маленькая stats-plашка с числом Like за последние 7 дней, рядом с «Избранное». Можно собирать из `useFavorites().data.filter(i => likedAt > 7d ago).length`.

### 3.3 Быстрый jump в ленту с кого-то конкретного

На элементе favorites-списка — добавить кнопку «Показать профиль» которая открывает модалку с полной `<SwipeCard>` preview-режиме. Удобно когда нужно перепроверить, кого ты лайкнул.

---

## Инварианты (для Cursor'а — не нарушать)

- **Список избранного — это НЕ отдельная таблица.** Это derived view из `MatchSwipe`. Не заводи модель `MatchFavorite`.
- **Удаление из избранного = удаление LIKE-свайпа.** После этого профиль снова может появиться в ленте.
- Не добавлять `useFavorites()` в `BottomTabs` для badge — у нас там уже `useMatches()`, и лишний polling каждые 5 секунд никому не нужен.
- Страница `/m/favorites` — **не** под `BottomTabs`. Там back-button. Если добавишь таб — пользователь не будет понимать, куда убираются лайки после матча.

---

## Чеклист перед коммитом

```bash
cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json
cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json
cd apps/web && pnpm exec eslint 'app/**/*.{ts,tsx}'
cd apps/api && pnpm run test
```

Ручная проверка:
1. Лайкнул карточку → открыл `/m/profile` → увидел счётчик +1 в «Избранное»
2. Открыл `/m/favorites` → карточка на месте
3. Удалил через trash-кнопку → карточка пропала, счётчик −1
4. Снова пошёл в ленту → карточка того же человека снова видна
5. Лайкнул, партнёр лайкнул в ответ (через dev-скрипт / вторая сессия) → карточка ушла из `/m/favorites`, появилась в `/m/matches`
6. Попытка DELETE /match-api/favorites/:id для уже-матчёванного партнёра (после 1.1) → 400 `favorite_is_match`
