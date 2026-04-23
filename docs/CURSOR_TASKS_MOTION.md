# Match-app — анимация и микровзаимодействия (iOS motion)

> Задача для Cursor. P0 — уже в коде, **не откатывать** и **не заменять easing/durations на свои**. Дальше — follow-up доработки.

---

## P0 — что уже в коде (не откатывать)

### Глобальные motion-токены

**Файл:** `apps/web/app/globals.css`

Добавлены CSS-переменные с iOS-spring easing и стандартными длительностями:

```css
--ease-ios:           cubic-bezier(0.22, 1, 0.36, 1);   /* обычный iOS spring */
--ease-soft:          cubic-bezier(0.33, 1, 0.68, 1);   /* мягкий fade */
--ease-swipe-return:  cubic-bezier(0.16, 1, 0.3, 1);    /* возврат карточки */
--ease-swipe-fly:     cubic-bezier(0.32, 0.72, 0, 1);   /* вылет карточки */

--dur-fast:   150ms;
--dur-base:   220ms;
--dur-medium: 320ms;
--dur-slow:   420ms;
```

Плюс keyframes и helper-классы:

- `@keyframes ios-fade-up` → `.animate-fade-up`
- `@keyframes ios-pop-in` → `.animate-pop-in` (scale 0.94 → 1.02 → 1)
- `@keyframes ios-backdrop-in` → `.animate-backdrop-in`
- `.ios-interactive` — универсальный transition (bg/color/border/shadow/transform/opacity), `active:scale(0.97)`

Уже есть `@media (prefers-reduced-motion: reduce)` в том же файле — он обнуляет все durations до `0.01ms`. **Не убирать.**

### SwipeStack

**Файл:** `apps/web/app/m/_components/SwipeStack.tsx`

Три разных режима transition через `useMemo`:

```ts
if (isDragging)   return 'none';
if (isFlying)     return `transform ${FLY_DURATION_MS}ms var(--ease-swipe-fly)`;
if (isReturning)  return `transform ${RETURN_DURATION_MS}ms var(--ease-swipe-return)`;
default           → `transform ${RETURN_DURATION_MS}ms var(--ease-ios)`;
```

Константы:

```ts
const FLY_DURATION_MS = 320;
const RETURN_DURATION_MS = 420;
```

`setTimeout(onDecision, FLY_DURATION_MS)` и `setTimeout(setIsReturning(false), RETURN_DURATION_MS)` — цифры синхронизированы с transition duration. **Не менять одно без другого.**

Флаг `isDraggingRef` добавлен для борьбы со stale closure в `onPointerMove`.

Визуальные улучшения:

- Дистанция вылета `140vw` — карточка уходит за экран.
- Нижние карточки поднимаются на `lift = isFlying ? 1 : 0` уровень — стек перетекает.
- Top-карточка слегка масштабируется при драге: `scale(1 + dragMagnitude * 0.015)`.
- LIKE/NOPE штампы пульсируют: `opacity + scale(0.85 + opacity * 0.2)` через `--ease-ios`.
- Ротация при драге мягкая: `dx / 20`.

**Тест:** `SwipeStack.test.tsx` уже выставляет `vi.advanceTimersByTime(400)` — под FLY_DURATION_MS=320. Если меняешь FLY_DURATION_MS — синхронизируй тест.

### Остальные компоненты

- **Chip** — transition через инлайн-стили `transitionDuration: var(--dur-base); transitionTimingFunction: var(--ease-ios)`. `active:scale-[0.96]`.
- **BottomTabs** — тот же паттерн. `active:scale-[0.94]`.
- **ActionBar** — кнопки свайпа получили `active:scale-[0.9]` (тактильнее больших кнопок).
- **MatchModal** — backdrop теперь `.animate-backdrop-in`, sheet — `.animate-pop-in`.

**Инвариант:** в этих файлах нельзя возвращать `transition-transform duration-150 ease-out` из Tailwind. Всегда через `var(--ease-ios/soft/swipe-*)` и `var(--dur-*)`.

---

## P1 — следующие мелкие моторные правки

### 1.1 Chat back-button и send-button — на iOS-easing

**Файл:** `apps/web/app/m/matches/[pairId]/page.tsx`

Сейчас у круглых кнопок (`Назад`, `Отправить`) есть `transition active:scale-95` без явного easing. Приведи к стандарту:

```diff
- className="flex h-9 w-9 items-center justify-center rounded-full ... transition active:scale-95"
+ className="flex h-9 w-9 items-center justify-center rounded-full ... active:scale-[0.94]"
  style={{
    background: '...',
+   transitionDuration: 'var(--dur-base)',
+   transitionTimingFunction: 'var(--ease-ios)',
+   transitionProperty: 'transform, background-color, opacity',
  }}
```

Send-button — `active:scale-[0.9]` (как в ActionBar). Input внутри glass-bar тоже можно наклонить на `:focus-within` — мягкая подсветка border через `--ease-soft`.

### 1.2 Favorites / Matches / Profile — круглые действия-кнопки

**Файлы:**
- `apps/web/app/m/favorites/page.tsx` — красная Trash-кнопка
- `apps/web/app/m/profile/page.tsx` — Copy / Share / Revoke в списке инвайтов
- `apps/web/app/m/matches/page.tsx` — filter pills и `В архив / В ленту`

Замени голый `transition active:scale-95` на ios-easing (см. 1.1). Все action-кнопки должны чувствоваться одинаково.

### 1.3 PhotoGallery — плавный grid-reorder

**Файл:** `apps/web/app/m/_components/PhotoGallery.tsx`

`useSortable` из `@dnd-kit/sortable` уже отдаёт `transform`/`transition`. Добавь класс `.ios-interactive` на сам тайл, чтобы при drop анимация была спокойнее:

```diff
  <div
    ref={setNodeRef}
    style={{ transform: CSS.Transform.toString(transform), transition }}
-   className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-[rgb(var(--hairline))] bg-[rgb(var(--ios-bg-elevated))]"
+   className="ios-interactive relative aspect-square overflow-hidden rounded-2xl ring-1 ring-[rgb(var(--hairline))] bg-[rgb(var(--ios-bg-elevated))]"
```

Delete-кнопка в углу — `active:scale-[0.9]`.

### 1.4 Feed page — вход карточки сверху

**Файл:** `apps/web/app/m/feed/page.tsx`

При входе в `/m/feed` страница появляется мгновенно. Оберни `SwipeStack` в wrapper `.animate-fade-up` — мягкий fade+translate на 8px. Это даст iOS-ощущение «въезд в экран».

```tsx
<div className="animate-fade-up">
  <SwipeStack ... />
</div>
```

Только без перегиба: `.animate-fade-up` включается один раз при mount, повторно не срабатывает.

### 1.5 Haptic feedback на критичных действиях

Уже используется в `feed/page.tsx` (`hapticImpact('light')`, `hapticNotification('success'|'warning')`). Проверь, что haptic зовётся также:

- в `MatchModal` при появлении — `hapticNotification('success')` в `useEffect(() => { if (open) hapticNotification('success'); }, [open])`
- в `ActionBar` при клике — `hapticImpact('medium')` до `onPass/onLike`, `light` для `onUndo`
- в `Toggle` (settings/onboarding) при переключении — `hapticImpact('light')` в `onChange`

Если реализуешь — helper `hapticImpact`/`hapticNotification` уже есть в `apps/web/app/m/_lib/telegram.ts`.

---

## P2 — анимация переходов между страницами

Next.js App Router сам по себе не анимирует `router.push` / `router.replace`. Это заметно при `/m/feed → /m/matches/[pairId]`. Добавь лёгкий переход через View Transitions API, который поддерживается в мобильных Safari 18+ (iOS 18+):

**Файл:** `apps/web/app/m/layout.tsx`

```tsx
'use client'; // ← нужно сделать клиентским, иначе startViewTransition не дёрнется

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

function ViewTransitions({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    // @ts-ignore — пока не во всех lib.d.ts
    if (typeof document !== 'undefined' && document.startViewTransition) {
      // Next уже обновил DOM — тут ничего не делаем, просто регистрируем hook.
      // Реальное переиспользование: на событиях навигации оборачивать router.push.
    }
  }, [pathname]);
  return <>{children}</>;
}
```

Лучше минималистично: положить в `globals.css`:

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 260ms;
  animation-timing-function: var(--ease-ios);
}
```

И при кликах на основные ссылки использовать:

```ts
import { useRouter } from 'next/navigation';
const router = useRouter();

const onGo = (href: string) => {
  if ('startViewTransition' in document) {
    (document as any).startViewTransition(() => router.push(href));
  } else {
    router.push(href);
  }
};
```

Начни с `BottomTabs` и `ChevronRight`-строк в `/m/profile`. Где нет — плавный fallback без анимации.

---

## P3 — производительность

### 3.1 Проверить frame-rate при свайпе

Открой DevTools → Performance, запиши 3-секундную сессию драга карточки. Цель:

- стабильные 60 fps (или 120 на ProMotion)
- нет layout-thrashing при `setDx/setDy` — должно быть только compositing

Если frames проседают — возможно, виноват `SwipeCard` (повторные рендеры внутри top-card). Перепроверь `React.memo` на `SwipeCard`, чтобы не перерендеривался на каждый `dx`.

### 3.2 `will-change` — не навсегда

Сейчас `will-change: transform` стоит статически на top-card и на stack-layers. Это хорошо во время драга, но плохо когда ничего не движется (занимает слой композитинга). Переключай:

```tsx
style={{
  ...
  willChange: isDragging || isFlying || isReturning ? 'transform' : 'auto',
}}
```

---

## Чеклист

```bash
cd apps/web
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint 'app/**/*.{ts,tsx}'
pnpm run test
pnpm run build
```

### Ручная проверка

1. Свайп вправо/влево: карточка уходит за экран за ~320ms с плавным замедлением, LIKE/NOPE штамп растёт вместе с дистанцией.
2. Свайп ниже порога → карточка возвращается к центру за ~420ms с лёгким spring-эффектом.
3. На /m/profile нажатие кнопки «копировать/поделиться/удалить» — шкала 0.9, мягкое возвращение.
4. MatchModal после взаимного лайка — backdrop fade, sheet с маленьким pop-in (scale 0.94 → 1.02 → 1).
5. В iOS Settings → Accessibility → Motion: включить «Reduce Motion». Перезагрузить mini-app. Все анимации должны практически исчезнуть (durations 0.01ms из CSS).

### Что прислать

- Скринкаст (GIF 5–10s) свайпа на реальном устройстве.
- Performance-запись DevTools (см. P3.1).
- Подтверждение, что «Reduce Motion» корректно гасит анимации.

---

## Инварианты (не нарушать)

- **Не возвращайся к Tailwind `transition-* ease-out duration-150`** в компонентах /m — всё через var(--ease-*/--dur-*).
- **Не меняй FLY_DURATION_MS без обновления теста** `SwipeStack.test.tsx`.
- **Не убирай `@media (prefers-reduced-motion: reduce)`** из globals.css.
- **Не выставляй `will-change` статически** на элементах, которые большую часть времени неподвижны.
- **Не добавляй JS-based анимационные либы** (framer-motion / react-spring) без обсуждения — весь motion сейчас на CSS transitions/animations, это легко и быстро.
