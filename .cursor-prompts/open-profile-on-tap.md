# Фича: открытие полного профиля участника по тапу в ленте

## Контекст

Next.js 16 App Router, TypeScript, Tailwind v4 + кастомные CSS-переменные (`--ios-*`). Дизайн-система iOS Liquid Glass. Zustand для стора матчей. Моно-репо pnpm, web-приложение в `apps/web`.

Страница ленты — `apps/web/app/m/feed/page.tsx`. Карточка — `apps/web/app/m/_components/SwipeCard.tsx`. Логика свайпа/драга — `apps/web/app/m/_components/SwipeStack.tsx`. Типы профиля — `apps/web/app/m/_lib/api.ts` (тип `FeedCard extends MatchProfile`). Лейблы — `apps/web/app/m/_lib/labels.ts`. Хелперы ролей — `apps/web/app/m/_lib/role.ts`. Пример модалки для стилистики — `apps/web/app/m/_components/MatchModal.tsx`.

## Задача

Пользователь тапает по верхней карточке в ленте — открывается модалка с полной информацией по участнику. Свайпы (влево/вправо, like/pass) и переключение фото внутри карточки **не должны сломаться**.

## Шаг 1. Новый компонент `ProfileDetailModal`

Создать `apps/web/app/m/_components/ProfileDetailModal.tsx`:

- `'use client'`.
- Пропсы: `{ card: FeedCard | null; open: boolean; onClose: () => void }`.
- Если `!open || !card` — вернуть `null`.
- Полноэкранный `fixed inset-0 z-50`, на десктопе центрирована (`sm:items-center`), на мобилке — снизу (`items-end`).
- Бэкдроп: кнопка с `absolute inset-0 bg-black/50 backdrop-blur-xl` и классом `animate-backdrop-in`, `onClick={onClose}`.
- Контейнер: `glass glass-edge animate-pop-in rounded-t-[28px] sm:rounded-[28px] max-w-[460px] max-h-[92vh] flex flex-col overflow-hidden`.
- Кнопка закрытия справа сверху: иконка `X` из `lucide-react` на `bg-black/35 backdrop-blur-md` в круге 36×36.
- Блок фото 340 px:
  - Карусель фото: объединить `card.avatarUrl` и отсортированные по `order` `card.photos`, исключая дубликаты. Если список пустой — диагональный градиент из `--ios-pink`/`--ios-orange`.
  - `next/image` с `fill`, `unoptimized`, `sizes="460px"`, `object-cover`.
  - Левая/правая половины (по трети ширины) — прозрачные кнопки для переключения фото.
  - Индикатор страниц сверху (полоски `h-[3px]`, активная `bg-white/95`, остальные `bg-white/40`).
  - Внизу градиент `linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)` высотой 28.
  - Поверх градиента — имя (`text-[26px] font-semibold line-clamp-2`) и роль белым.
- Скроллируемый контент `flex-1 overflow-y-auto px-5 pb-5 pt-4`:
  - `card.headline` — крупный текст, если есть.
  - Цена — инлайн-пилюля `rounded-full border bg-[rgb(var(--ios-fill-1)/0.18)]`. Формат: `priceMin–priceMax ₽/час` (валюта `RUB → ₽`, иначе сам код), локаль `ru-RU`. Если обе цифры невалидны — не показывать.
  - Строка геолокации: город (`MapPin`) и опыт (`Briefcase`) через разделитель `•`. Опыт через `getExperienceLabel(card.experience)` из `_lib/role.ts`.
  - Чипы форматов работы (`workFormats`): каждый с иконкой — `HYBRID`→`Users`, `OFFICE`→`Building2`, `REMOTE`→`Home` (размер 12, `strokeWidth={2.2}`). Подписи из `WORK_FORMAT_LABELS`.
  - Секция «О себе» с `card.bio`. Заголовок секции — `<div className="ios-section-header">`.
  - Секция «Ниши» — чипы на нейтральном фоне.
  - Секция «Навыки» — чипы с акцентным фоном `rgb(var(--ios-tint)/0.14)`.
  - Секция «Маркетплейсы» — подписи из `MARKETPLACE_LABELS` (`_lib/labels.ts`) + опционально `card.marketplacesCustom` отдельным чипом.
  - Портфолио — `<a>` с `target="_blank"` и классом `ios-btn-plain`, иконка `ExternalLink`. Только если `card.portfolioUrl` непуст.
  - Telegram-контакт — `<a>` `ios-btn-tinted` с иконкой `Send`. Если значение начинается с `http` — ссылка as-is, иначе `https://t.me/` + значение без ведущего `@`. Лейбл: сырая @-ручка или просто «Telegram».
- Эффекты:
  - При смене `card.id` и при открытии сбрасывать индекс фото в 0.
  - На время открытия `document.body.style.overflow = 'hidden'`, восстанавливать при размонтировании/закрытии.
  - Закрытие по `Escape`.

## Шаг 2. Правки `SwipeStack.tsx`

Задача — отличить тап от свайпа и прокинуть наружу колбэк.

1. Расширить тип пропсов:
   ```ts
   type Props = {
     cards: FeedCard[];
     onDecision: (direction: 'LIKE' | 'PASS', card: FeedCard) => void;
     onCardTap?: (card: FeedCard) => void;
   };
   ```
2. Добавить константу `TAP_MOVEMENT_THRESHOLD_PX = 8` рядом с существующими порогами.
3. Принять `onCardTap` в сигнатуре `SwipeStack`.
4. Добавить `useRef<boolean>(false)` — `startedOnInteractiveRef`, чтобы не триггерить тап, если палец опустили на внутреннюю кнопку карточки (переключатели фото).
5. В `onPointerDown`: после установки `startRef` определить `target = event.target as HTMLElement | null` и записать `startedOnInteractiveRef.current = Boolean(target?.closest('button, a, input, textarea, select, [role="button"]'))`.
6. В `onPointerUp` в ветке «не прошёл порог свайпа» (после сброса `dx`/`dy` и запуска анимации возврата) добавить:
   ```ts
   const totalMovement = Math.abs(dx) + Math.abs(dy);
   const startedOnInteractive = startedOnInteractiveRef.current;
   startedOnInteractiveRef.current = false;
   if (
     topCard &&
     onCardTap &&
     !startedOnInteractive &&
     totalMovement < TAP_MOVEMENT_THRESHOLD_PX
   ) {
     onCardTap(topCard);
   }
   ```
   Важно: `totalMovement` вычисляем **до** `setDx(0)/setDy(0)` (в текущей реализации `dx`/`dy` — это замкнутые значения из рендера, это работает, но держите переменные выше вызовов сеттеров). В ветке свайпа ничего не меняется — колбэк там не вызывается, просто сбросить `startedOnInteractiveRef` тоже можно в начале функции.

## Шаг 3. Подключение на странице ленты

В `apps/web/app/m/feed/page.tsx`:

1. Импорты:
   ```ts
   import { ProfileDetailModal } from '../_components/ProfileDetailModal';
   import type { FeedCard } from '../_lib/api';
   ```
2. Рядом с остальным локальным стейтом:
   ```ts
   const [openedProfile, setOpenedProfile] = useState<FeedCard | null>(null);
   ```
3. В рендере `<SwipeStack>` добавить проп `onCardTap={(card) => setOpenedProfile(card)}`.
4. Ниже блока `<MatchModal>` добавить:
   ```tsx
   <ProfileDetailModal
     open={!!openedProfile}
     card={openedProfile}
     onClose={() => setOpenedProfile(null)}
   />
   ```

## Критерии приёмки

- Тап без движения по любой области карточки (кроме кнопок переключения фото) открывает модалку.
- Свайп (ушёл дальше 40% ширины или быстрее порога скорости) открывает не модалку, а выполняет LIKE/PASS как раньше.
- Маленький драг (<8 px суммарно), который возвращает карточку на место, **тоже** трактуется как тап — это ок.
- Клики по стрелочкам и точкам-индикаторам фото продолжают листать фото и не открывают модалку.
- Esc и клик по бэкдропу закрывают модалку. Тело страницы не прокручивается, пока модалка открыта.
- `pnpm -F web typecheck` (или аналог — `tsc --noEmit` внутри `apps/web`) проходит без ошибок.

## Что не трогать

- Логику свайпа (`SWIPE_THRESHOLD_RATIO`, `VELOCITY_THRESHOLD`, `FLY_DURATION_MS`, `RETURN_DURATION_MS`), хаптику, стор `useMatchStore`, `ActionBar`, мутации React Query.
- Вёрстку самой `SwipeCard.tsx` — карточка остаётся прежней, вся логика тапа живёт в `SwipeStack`.
