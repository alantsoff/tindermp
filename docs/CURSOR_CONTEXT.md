# Match-app — контекст для Cursor (после iOS-редизайна)

> Этот документ описывает, что добавилось / изменилось в проекте после того, как Cursor прошёлся по [CURSOR_TASKS.md](./CURSOR_TASKS.md). Читай его перед любыми правками в `apps/web/app/m/**` и `apps/web/app/globals.css`, чтобы случайно не откатить изменения и не внести стилистические расхождения.

---

## 1. Дизайн-система iOS 26 «Liquid Glass»

Живёт в `apps/web/app/globals.css`. Устроена так:

### 1.1. Токены (CSS-переменные)

Палитра — Apple system colors, переключается автоматически по `prefers-color-scheme`. Ключевые переменные:

- `--ios-bg-base`, `--ios-bg-elevated`, `--ios-bg-inset` — слоистые фоны
- `--ios-label`, `--ios-label-secondary`, `--ios-label-tertiary` — цвета текста
- `--ios-tint` — акцент (violet/indigo)
- `--ios-blue / indigo / purple / pink / red / orange / yellow / green / teal / cyan / gray` — system colors
- `--ios-gray .. --ios-gray-6` — градация серого
- `--hairline`, `--hairline-strong` — бордеры
- `--material-ultra-thin / thin / regular / thick / chrome / menu` — Liquid Glass заливки (RGB/alpha)
- `--shadow-glass`, `--shadow-pop` — тени
- `--radius-card`, `--radius-tile`, `--radius-chip` — радиусы

Все цвета задаются через `rgb(var(--…))` или `rgb(var(--…) / 0.xx)`. **Не заменяй на Tailwind-утилиты типа `bg-zinc-900` / `text-white` / `border-violet-500`** — стиль расползётся между светлой и тёмной темой.

### 1.2. Tailwind-алиасы (`@theme inline`)

В `@theme inline` экспонированы цвета под tailwind arbitrary values:

- `text-ios-label`, `text-ios-label-secondary`, `text-ios-label-tertiary`
- `bg-ios-elevated`, `bg-ios-bg`, `bg-ios-inset`
- `text-ios-tint`, `text-ios-blue` и т. д.
- `border-ios-hairline`, `border-ios-separator`

Шрифт: `--font-sans` = SF Pro stack; `body { font-family: var(--font-sans) }` уже применён глобально.

### 1.3. Утилитарные классы (не трогать)

| Класс | Назначение |
|---|---|
| `.glass` | Liquid Glass поверхность (regular material + blur 28px + hairline + shadow) |
| `.glass-thin`, `.glass-ultra-thin`, `.glass-thick` | вариации материала |
| `.glass-chrome`, `.glass-menu` | материалы для tab bar и меню |
| `.glass-edge` | верхняя refraction-подсветка (top highlight) |
| `.ios-group` | iOS grouped-inset list контейнер (белый/тёмно-серый, bordered) |
| `.ios-row` | строка списка 44pt min-height с padding |
| `.ios-title-large` | 34/41 bold, tracking-tight — как iOS Large Title |
| `.ios-title` | 22/28 bold — как iOS Title |
| `.ios-section-header` | 13px uppercase semi-muted — iOS section header |
| `.ios-btn-primary` | filled tint, большой |
| `.ios-btn-tinted` | lighter tint (background: tint/14%) |
| `.ios-btn-plain` | нейтральная серая кнопка |
| `.ios-input` | поле ввода iOS-style с focus ring |
| `.ios-spinner` | маленький iOS spinner |

### 1.4. Ambient gradient

`body::before` рендерит фиксированный radial-gradient wash (indigo/pink/teal/purple) — он нужен, чтобы `backdrop-filter: blur()` в Liquid Glass имел что преломлять. **Не удалять**, иначе тёмная тема сваливается в плоский чёрный.

В тёмной теме `--ios-bg-base` = `rgb(14 14 18)` (не `#000`), чтобы blur-материалы не превратились в «чёрные контуры на чёрном». Это осознанное решение — проверено на реальном устройстве.

---

## 2. Обновлённые компоненты

Все в `apps/web/app/m/_components/`. Правило: не менять структуру, можно добавлять props.

### 2.1. `BottomTabs.tsx`

Плавающий pill tab bar (`position: fixed`, `bottom: env(safe-area-inset-bottom) + 14px`). Активная вкладка — capsule с фоном `rgb(var(--ios-tint)/0.16)` и акцентным цветом. Красный badge на «Матчи» при непрочитанных.

**Hook order (важно):** `useMatches` и `useMemo` вызываются **до** `if (pathname.startsWith('/m/onboarding')) return null;`. Если перемещаешь ранний return — хуки сначала, иначе React упадёт.

### 2.2. `Chip.tsx`

iOS pill-chip. Два состояния:
- selected: `bg = rgb(var(--ios-tint))`, белый текст, soft shadow
- unselected: `bg = rgb(var(--ios-bg-elevated))` + `border: 1px solid rgb(var(--hairline-strong))`. В dark mode это важный solid fill — иначе чипы становятся невидимыми на тёмном фоне.

### 2.3. `ActionBar.tsx`

Три круглые Liquid Glass кнопки: PASS (red, 64px), UNDO (yellow, 48px), LIKE (green, 64px). Используют внутренний helper `<ActionButton>` (определён на module level, не в render).

### 2.4. `MatchModal.tsx`

Полноэкранный overlay с `backdrop-blur-xl`, внутри — центрированный `.glass` card с градиентным фоном (`ios-pink → ios-indigo`) и Sparkles-иконкой. Backdrop — отдельная клик-область для закрытия.

### 2.5. `SwipeCard.tsx`

**Не упрощать.** Это главный визуал приложения. Структура:
- 540px высота, `rounded-[28px]`, `.glass.glass-edge`
- Верхняя 320px — media area с `<Image fill>` (next/image, `unoptimized` — иначе Telegram фото не грузится)
- Fallback — градиент `ios-indigo/ios-pink` если нет фото
- Градиент-wash 40px в низ media для читаемости текста
- Dot-пагинация сверху (если фото >1)
- Имя + роль + zodiac + город + marketplace badges поверх фото в белом тексте
- Низ — headline / bio / chips «Ниши» и «Навыки» в `ios-fill-1/0.16`

Индекс фото хранится через `photoCardId` + `photoIndex`, чтобы не нужно было `useEffect` для ресета при смене `card.id`.

### 2.6. `SwipeStack.tsx`

LIKE/NOPE штампы — `position: absolute` в углах карточки с плавным `opacity` по `Math.abs(dx) / 100`. Цвета через `rgb(var(--ios-green))` / `rgb(var(--ios-red))`. Spring-animation делается через `transition-transform duration-200 ease-out`.

### 2.7. `ChatBubble.tsx`

iMessage-style:
- мои сообщения: `rounded-[20px]` с `rounded-br-md`, gradient от tint к purple, soft tint shadow
- их сообщения: `bg-ios-bg-elevated`, `rounded-bl-md`
- system messages: центрированный pill `.glass-ultra-thin`

### 2.8. `Avatar.tsx`

Круглый. Если `url` — `<img>` с `ring-1 ring-ios-hairline`. Без url — gradient фон (hue из name) + инициал. `font-size = Math.round(size * 0.42)`.

### 2.9. `PhotoGallery.tsx`

iOS-тайлы 3 в ряд, `rounded-2xl`, ring-hairline. Delete/drag-кнопки 28×28 с `bg-black/55 backdrop-blur-md`. Add-кнопка — dashed border с Plus. Telegram-фото отдельно выделено рамкой tint.

Компрессия фото: `maxSizeMB: 1.8` (не 0.5 — это слишком жёстко для современных селфи). На бекенде квалити-каскад 82→70→60.

---

## 3. Страницы `/m/*`

Все страницы используют только утилиты из `globals.css` и system colors. Фон страниц — прозрачный (body ambient gradient виден).

### 3.1. `feed/page.tsx`

- Заголовок `ios-title-large` + pill справа со streak/лимитом лайков
- Баннер «Мы обновили вашу ленту» (glass + gradient) при auto-reset
- Empty state: круглая tint-иконка + три iOS-кнопки (`ios-btn-plain` × 2 + `ios-btn-primary`)
- Loading → `ios-spinner`
- Toast ошибок — `.glass` с red accent

### 3.2. `matches/page.tsx`

- `ios-title-large`, iOS search input с Search-иконкой, filter pills (extracted **на module level** как `FilterPill` — НЕ определять внутри компонента!)
- Список — `ios-group`, каждая строка flex с аватаром/именем/preview/датой/unread-dot/archive-кнопкой

### 3.3. `matches/[pairId]/page.tsx`

- Back-button (круглая tint-кнопка) + `ios-title`
- Scroll-контейнер с `scrollIntoView` на новое сообщение
- Input-bar: `.glass.glass-edge` rounded-full + круглая send-кнопка tint

### 3.4. `onboarding/page.tsx` — СВЕЖЕ ОБНОВЛЁН

**Архитектура:**
- SSR-safe: все browser-only API (`getTelegramInitUser`, `getTelegramPhotoUrl`) читаются только внутри `useEffect`, не в теле компонента
- `useEffect` делает `async function hydrate()` с `await Promise.resolve()` — иначе ESLint ругается на `react-hooks/set-state-in-effect`
- `cancelled` флаг защищает от race при быстром unmount

**Префилл полей:**
1. Сначала из Telegram (`displayName` из `first_name + last_name`, или `@username`; `telegramContact`, `telegramPhotoUrl`)
2. Потом запрашивается `matchApi.me()` — если профиль уже есть (редактирование), перезаписываются: `displayName`, `role`, `roleCustom`, `birthDate`, `workFormats`, `marketplaces`, `marketplacesCustom`, `niches`, `skills`, `headline` (с попыткой разобрать обратно на `purposePreset + purposeText` по паттерну `"Preset — rest"`)
3. Если сохранённый `avatarUrl` отличается от текущего Telegram-фото или его нет — тумблер «использовать фото из Telegram» выключается (не перезаписываем выбор пользователя)

**Фото:**
- Тумблер «Фото из Telegram» (iOS `<Toggle>`) — превью + переключатель
- Локальная галерея до 6 доп. фото как `File[]` в state
- Preview через `URL.createObjectURL`, cleanup через `URL.revokeObjectURL` в return useEffect
- После `upsertProfile` фото заливаются последовательно через `matchApi.uploadPhoto` с `browser-image-compression` (1.8MB, 1080px, webp)
- На кнопке submit показывается прогресс «Загружаем фото N/M…»
- Ошибки одиночных загрузок не ломают флоу — `console.warn` + продолжить

**`PURPOSE_PRESETS`:** первыми идут короткие быстрые кнопки: `'Найти команду'`, `'Нетворкинг'`, далее длинные варианты. Не удалять короткие.

### 3.5. `invite/page.tsx` / `MatchInviteClient.tsx`

Centered `.glass.glass-edge` card с tint-gradient иконкой Sparkles. Инпут кода со `tracking-[0.3em]`. `ios-btn-primary` submit. Нормализация кода `XXXX-XXXX`.

### 3.6. `profile/page.tsx`

- Hero-card `.glass` с аватаром + именем + ролью + headline
- Секции `ios-group` с `<InfoRow>` (label слева, value справа)
- «Кого ищу» со счётчиком активных фильтров и ссылкой на `/m/settings`
- Галерея фото внутри `.glass`
- Invite-список: для каждого кода три круглые кнопки (Copy/Share/Revoke) с семантическими цветами
- Сверху кнопка-строка «Как пользоваться» (open `<WelcomeTutorial>`).
- Между «Как видят мой профиль» и «О себе» — секция **«Ваша активность»** (приватный квадрант из `ActivityQuadrant` + счётчики за 14 дней + коучинг). Рендерится только если `data.activity` не `null` — бэк возвращает `null` до `accountAgeDays >= 7` и `likesSent14d >= 3` (lagging-indicator guard). Считай это контрактом — не рендери секцию по другим условиям.
- Коучинг-копия живёт в `ACTIVITY_QUADRANT_COPY` словаре в `_components/ActivityQuadrant.tsx`. Текст подобран нейтрально: без «рейтинга», «ниже среднего», без процентов отказов.

### 3.7. `settings/page.tsx`

- Sticky save-bar: `position: fixed`, `bottom: env(safe-area-inset-bottom) + 96px`, `pointer-events-none` у контейнера + `pointer-events-auto` у кнопки, ширина `max-w-[400px]`, centered. **Не делать sticky — только fixed**, иначе перекрывает BottomTabs.
- Внутренний `<Toggle>` компонент — **определён на module level**, не в теле `MatchSettingsPage`. Используется для «Только мой город», «Скрыть профиль из ленты».
- `<Section>` и `<SmallTextButton>` тоже на module level.
- Разделы обёрнуты в `<Section>` (glass) или `ios-group` (list) — выбирай по смыслу.

---

## 4. iOS Toggle (важный паттерн)

Живёт в двух местах: `settings/page.tsx` и `onboarding/page.tsx`. Спека:

```tsx
<button
  type="button"
  role="switch"
  aria-checked={checked}
  className="relative shrink-0 cursor-pointer rounded-full transition-colors duration-200"
  style={{
    width: 51,
    height: 31,
    padding: 0,
    flex: '0 0 51px',                                 // ← обязательно, иначе flex сжимает
    background: checked ? 'rgb(var(--ios-green))' : 'rgb(var(--ios-gray-3))',
  }}
>
  <span
    style={{
      width: 27, height: 27,
      position: 'absolute', top: 2, left: 2,
      transform: checked ? 'translateX(20px)' : 'translateX(0)',
      boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)',
    }}
  />
</button>
```

**Почему inline-style для размеров:** в flex-контексте Tailwind arbitrary values типа `w-[51px]` могут схлопнуться, и тумблер визуально «выезжает» за трек. Фиксим через inline + `flex: '0 0 51px'` + `shrink-0`.

**Translate 20px, не 22px:** классическая iOS геометрия = 51 − 27 − 2 − 2 = 20.

Если добавляешь новый Toggle где-то ещё — **скопируй ровно эту реализацию**, не упрощай.

---

## 5. Правила сопровождения

### ✅ Делать так

- Использовать токены `--ios-*` и классы `.glass*` / `.ios-*`
- Новые компоненты определять **на module level**, не внутри render (иначе `react-hooks/static-components`)
- Все хуки — **до** условных return (Rules of Hooks)
- Browser-only API (`window.*`, `navigator.*`, `document.*`) — только в `useEffect`, с `typeof window !== 'undefined'` guard
- Длинные set-state цепочки в effect — оборачивать в `async function hydrate() { await Promise.resolve(); ... }`
- Фото сжатие — `maxSizeMB: 1.8`, `maxWidthOrHeight: 1080`, `fileType: 'image/webp'`
- Fixed-position элементы (save-bar, FAB) — использовать `calc(env(safe-area-inset-bottom) + N + 84px)` чтобы не наезжать на BottomTabs (84px — высота tab bar pill)
- Tailwind arbitrary values для единоразовых стилей; для цветов из палитры — `text-[rgb(var(--ios-tint))]` или `style={{ color: 'rgb(var(--ios-tint))' }}`

### ❌ Не делать

- Не возвращать цвета `zinc-*` / `white` / `black` / `violet-*` — стиль сломается при переключении темы
- Не удалять `body::before` ambient gradient
- Не менять `--ios-bg-base` на чистый `#000` в dark mode
- Не переписывать материалы `--material-*` — они калиброваны
- Не определять компоненты внутри других компонентов (breaks hooks, triggers `react-hooks/static-components`)
- Не делать `sticky` для save-bar в settings — только `fixed` с правильным bottom offset
- Не переходить обратно на `<img>` вместо `<Image>` в SwipeCard (Next требует `<Image fill unoptimized sizes="100vw">`)

### 🛡 Инварианты activity × reciprocity scoring (не нарушать)

Подробнее — `docs/CURSOR_TASKS_ACTIVITY_SCORE.md` §4. Коротко:

- **Public negative-сигналы запрещены.** Бейдж на `SwipeCard` — только `ACTIVE_TODAY` / `WEEKLY_TOP`. Не добавляй «новый профиль», «давно не заходил», «мало матчей».
- **Raw quadrant / activityScore / lastActiveAt не утекают.** `feed.service.ts` их строго стрипает из ответа. Если расширяешь `FeedCard` — не возвращай эти поля.
- **В приватном экране — никаких процентов.** Формат «3 из 23», а не «13%». Не добавляй слова «рейтинг», «ниже среднего», «место в топе».
- **Lagging guard не трогать.** `profile.service.ts` возвращает `activity: null` при `accountAgeDays < 7` или `likesSent14d < 3`. Новички не должны видеть квадрант.
- **Over-liker penalty остаётся мягким** (`QUADRANT_OVER_LIKER: -20` в `match.constants.ts`). Не делай отрицательный мульт или блокировку — замкнёшь цикл.
- **Goodhart protection:** в UI нет описания критериев бейджа. Не добавляй tooltip «получен за X матчей за неделю».

### 🧪 После любых правок в `apps/web`

```bash
cd apps/web
pnpm exec tsc --noEmit -p tsconfig.json         # типы
pnpm exec eslint 'app/**/*.{ts,tsx}'             # правила React Hooks и Next
pnpm --filter @match/web test                    # unit
pnpm --filter @match/web run build               # production build
```

Все эти команды должны отрабатывать без ошибок/warnings перед коммитом.

---

## 6. Файлы, которые были созданы / переписаны

| Файл | Тип |
|---|---|
| `apps/web/app/globals.css` | переписан (iOS dark/light палитра + Liquid Glass) |
| `apps/web/app/layout.tsx` | изменён (`themeColor`, SF font, antialiased) |
| `apps/web/app/m/layout.tsx` | изменён (safe-area, max-width 430) |
| `apps/web/app/m/page.tsx` | fallback → `ios-spinner` |
| `apps/web/app/m/_components/BottomTabs.tsx` | переписан |
| `apps/web/app/m/_components/Chip.tsx` | переписан |
| `apps/web/app/m/_components/ActionBar.tsx` | переписан |
| `apps/web/app/m/_components/MatchModal.tsx` | переписан |
| `apps/web/app/m/_components/Avatar.tsx` | мелкие правки |
| `apps/web/app/m/_components/SwipeCard.tsx` | переписан (новая структура с медиа-обложкой) |
| `apps/web/app/m/_components/SwipeStack.tsx` | LIKE/NOPE stamps |
| `apps/web/app/m/_components/ChatBubble.tsx` | переписан |
| `apps/web/app/m/_components/PhotoGallery.tsx` | iOS-стилистика |
| `apps/web/app/m/_components/MatchInviteClient.tsx` | iOS card |
| `apps/web/app/m/_components/MatchBootstrap.tsx` | ios-spinner на loading |
| `apps/web/app/m/feed/page.tsx` | iOS-стилистика, pill с лимитом, empty state |
| `apps/web/app/m/matches/page.tsx` | search + filter pills + group list (`FilterPill` module-level) |
| `apps/web/app/m/matches/[pairId]/page.tsx` | back button + iMessage input bar |
| `apps/web/app/m/profile/page.tsx` | hero-card + grouped rows + invite tickets |
| `apps/web/app/m/settings/page.tsx` | grouped sections + iOS `<Toggle>` + fixed save-bar |
| `apps/web/app/m/onboarding/page.tsx` | полная перезапись: фото-секция (Telegram toggle + локальные файлы), префилл из Telegram + existing profile, short presets |
| `apps/web/app/m/_components/SwipeStack.test.tsx` | добавлены недостающие поля в mock |

---

## 7. Краткий summary

Приложение визуально стало «iOS 26 Liquid Glass»: полупрозрачные материалы с blur, Apple system colors, SF Pro, grouped lists, iOS-style переключатели и pill tab bar. Параллельно поправлены несколько багов (hook order, set-state-in-effect, photo size limit, onboarding hydration) и добавлены фичи (управление фото в онбординге, короткие пресеты целей, подгрузка существующего профиля для редактирования).

Когда Cursor продолжит работу над `/m/*` — держи в голове это расщепление: **бизнес-логика живёт в services/queries, дизайн — в классах `.glass` / `.ios-*` и токенах `--ios-*`.** Не смешивай слои.
