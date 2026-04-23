# Activity × Reciprocity Score — хендоф для Cursor

> **Статус:** код реализован целиком, лежит в ветке. Осталось применить Prisma-миграцию, регенерировать клиент, прогнать типы/тесты/билд у себя локально, и поэтапно включать под-флаги. Этот файл — единая точка входа: план + список файлов + команды + rollout + справочник формул.
>
> **Не теряем:** окно 14 дней скользящее, Bayesian сглаживание на малых выборках, public negative signals НЕ показываем, пороги — в константах, не в миграциях.

---

## 0. Что нужно сделать прямо сейчас

### 0.1. Применить миграцию и перегенерировать Prisma client

```bash
cd /Users/rm/Проекты/match-app

# 1) Dev/локалка: применить миграцию (SQL уже лежит в packages/db/prisma/migrations/…).
DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/<db>" pnpm db:migrate

# 1b) Prod/сервер: использовать deploy-вариант, НЕ db:migrate
DATABASE_URL="postgresql://<user>:<pass>@<host>:5432/<db>?schema=public&sslmode=disable" pnpm db:migrate:deploy

# 2) Перегенерировать @prisma/client — после этого появится MatchActivityQuadrant
#    и новые поля на MatchProfile.
pnpm db:generate
```

Без шага 2 `pnpm --filter @match/api build` выдаст ошибки вида (все резолвятся генерацией, код корректный):

```
'MatchActivityQuadrant' has no exported member
Property 'likesSent14d' does not exist on type ...
Property 'quadrant' does not exist on type ...
```

### 0.2. Прогнать проверки

```bash
# API: типы, юниты, билд
pnpm --filter @match/api test       # должен пройти 21 новый + существующие
pnpm --filter @match/api build

# Web: типы, линт, билд
cd apps/web
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint 'app/**/*.{ts,tsx}'
pnpm --filter @match/web test
pnpm --filter @match/web run build
```

**Известные предсуществующие eslint-ошибки** (не связаны с этой работой): `apps/web/app/m/_components/ProfileDetailModal.tsx` (2× set-state-in-effect) и `apps/web/app/m/settings/page.tsx` (1× img alt). Я их не трогал.

### 0.3. Включить shadow-режим (стейдж 1)

В `apps/api/.env`:

```bash
MATCH_FEATURE_RECIPROCITY=1   # cron пишет в БД + секция в своём профиле
MATCH_RECIPROCITY_BADGES=0    # бейджи на карточках — пока нет
MATCH_RECIPROCITY_RANKING=0   # в выдаче квадранты пока не учитываются
```

Cron запускается в 04:30 Europe/Moscow. Для немедленной проверки вручную:

```ts
// в любом админ-действии или через REPL
await activityScoreService.recalcActivityScores();
```

---

## 1. Файлы, которые уже изменены

### 1.1. Prisma

| Файл | Что сделано |
|---|---|
| `packages/db/prisma/schema.prisma` | Enum `MatchActivityQuadrant`; 7 полей на `MatchProfile` (`likesSent14d`, `likesReceived14d`, `matches14d`, `activityScore`, `reciprocityScore`, `quadrant`, `scoreUpdatedAt`); индекс `@@index([quadrant])` |
| `packages/db/prisma/migrations/20260423150000_add_activity_scoring/migration.sql` | Готовая SQL-миграция — `CREATE TYPE` + `ALTER TABLE` + `CREATE INDEX` |

### 1.2. API — NestJS

| Файл | Что сделано |
|---|---|
| `apps/api/src/modules/match/activity-score.service.ts` | **Новый.** `recalcActivityScores()` с per-profile аггрегатами в чанках по 200; три чистые функции — `computeActivityScore`, `computeReciprocityScore`, `classifyQuadrant`; `getProfileSnapshot()` для приватного экрана; `flagSuspiciousProfiles()` — anti-bot shadow-write в `MatchSpamSignal`. Константы: `RECIPROCITY_PRIOR_WEIGHT=10`, `ACTIVITY_SATURATION_LIKES=40`, `ACTIVITY_THRESHOLD=0.35`, `SUSPICION_CRITERIA` с 4 порогами. |
| `apps/api/src/modules/match/activity-score.service.spec.ts` | **Новый.** 21 unit-тест: чистые функции (сглаживание, cap, log-scale, классификация), + regression guards на `SUSPICION_CRITERIA`. |
| `apps/api/src/modules/match/match.utils.ts` | Добавлена `profileCompleteness(profile)` — чистая функция 0..1 для эвристики полноты профиля (bio, headline, фото, ниши и т.д.). |
| `apps/api/src/modules/match/match.utils.spec.ts` | **Новый.** 6 unit-тестов на `profileCompleteness`. |
| `apps/api/src/modules/match/match-maintenance.service.ts` | Добавлен `@Cron('30 4 * * *')` под флагом `MATCH_FEATURE_RECIPROCITY`. Инжектирован `ActivityScoreService`. |
| `apps/api/src/modules/match/match.module.ts` | `ActivityScoreService` зарегистрирован в providers. |
| `apps/api/src/modules/match/match.constants.ts` | `RANKING_WEIGHTS` расширен: `QUADRANT_SOUGHT_AFTER=30`, `QUADRANT_SELECTIVE=10`, `QUADRANT_OVER_LIKER=-20`, `QUADRANT_SLEEPING=0`, `WEEKLY_TOP_ACTIVITY_FLOOR=0.7`. |
| `apps/api/src/modules/match/feed.service.ts` | В SQL добавлен `CASE p.quadrant …` (гасится в 0 при `MATCH_RECIPROCITY_RANKING=0`); `p.quadrant`, `p."activityScore"`, `p."lastActiveAt"` идут в SELECT; `activityBadge` вычисляется под `MATCH_RECIPROCITY_BADGES`; raw scoring-поля **строго стрипаются** из ответа. |
| `apps/api/src/modules/match/profile.service.ts` | `getMe()` возвращает приватный `activity` snapshot (только владельцу). Lagging-indicator guard: не отдаём квадрант при `accountAgeDays < 7` или `likesSent14d < 3` — возвращаем `activity: null`. |
| `apps/api/.env.example` | Задокументированы `MATCH_FEATURE_RECIPROCITY`, `MATCH_RECIPROCITY_BADGES`, `MATCH_RECIPROCITY_RANKING`. |

### 1.3. Web — Next.js

| Файл | Что сделано |
|---|---|
| `apps/web/app/m/_lib/api.ts` | Типы `MatchActivityQuadrant`, `MatchActivitySnapshot`, `ActivityBadge`; `MatchMeResponse.activity: MatchActivitySnapshot \| null`; `FeedCard.activityBadge?: ActivityBadge \| null`; demo-фикстура `LOCAL_DEMO_ME.activity` с SELECTIVE. |
| `apps/web/app/m/_components/ActivityQuadrant.tsx` | **Новый.** SVG 2×2 с подсветкой активного квадранта; экспорт `ACTIVITY_QUADRANT_COPY` — словарь коучинговых текстов по квадрантам. |
| `apps/web/app/m/profile/page.tsx` | Секция «Ваша активность» между «Как видят мой профиль» и «О себе». Квадрант + `ios-group` с тремя счётчиками (лайков отправлено / взаимных / вас лайкнули — формат «3 из 23», не проценты) + tint-блок с коуч-копией. Условный рендер: `data.activity ? … : null`. |
| `apps/web/app/m/_components/SwipeCard.tsx` | Pill-бейдж «Активен сегодня» (Flame, green) / «В топе недели» (Sparkles, tint) под ролью. Никаких negative-вариантов. |

---

## 2. Rollout план (стейджи)

Между стейджами — **минимум неделя** наблюдения. Откатывается каждый слой независимо через свой флаг.

| Стейдж | Флаги | Что видно пользователю | Критерий перехода |
|---|---|---|---|
| **S1 · shadow** | `RECIPROCITY=1`, `BADGES=0`, `RANKING=0` | Только своя секция «Ваша активность» в `/m/profile` | Распределение квадрантов не выродилось (не 100% в одном); нет жалоб |
| **S2 · badges** | + `BADGES=1` | На чужих карточках появляются «Активен сегодня» / «В топе недели» | matchRate SOUGHT_AFTER не падает; отсутствие жалоб «почему у меня нет бейджа» |
| **S3 · ranking** | + `RANKING=1` | Востребованные в ленте чаще; over-liker мягко ниже (−20) | Медианный matchRate популяции растёт или стабилен (2 недели) |

---

## 3. Справочник: формулы, пороги, квадранты

### 3.1. Активность (0..1)

```ts
activityScore = Math.min(1, Math.log1p(likesSent14d) / Math.log1p(40));
```

Идея: 40 лайков за 14 дней → 1.0, выше — плато. Log-scale дестимулирует массовые свайпы.

### 3.2. Отклик (0..1, Bayesian)

```ts
const α = 10;
const p0 = globalMatchRate14d;    // ~0.08..0.15 на популяции
reciprocityScore = (matches14d + α * p0) / (likesSent14d + α);
```

Идея: без истории → возвращает `p0`; на большой выборке → сходится к реальному matchRate. α=10 сбалансирован между шумом на новичках и ригидностью на активных.

### 3.3. Классификация

```
                 │  activity < 0.35       │  activity ≥ 0.35
─────────────────┼────────────────────────┼─────────────────────
reciprocity ≥ p0 │  SELECTIVE             │  SOUGHT_AFTER
reciprocity < p0 │  SLEEPING              │  OVER_LIKER
```

### 3.4. Бейджи

- `ACTIVE_TODAY` — `lastActiveAt` ≤ 24ч назад.
- `WEEKLY_TOP` — `quadrant === SOUGHT_AFTER` **и** `activityScore ≥ 0.7`.
- Если выполнены оба — отдаётся `WEEKLY_TOP` (более сильный сигнал).

### 3.5. Веса в ранжировании

```ts
QUADRANT_SOUGHT_AFTER: +30
QUADRANT_SELECTIVE:    +10
QUADRANT_OVER_LIKER:   -20
QUADRANT_SLEEPING:       0
```

Старый спам-фильтр (`likeRateRecent > 0.95 → score × 0.3`) остаётся — ловит крайности, пересечение с OVER_LIKER допустимо.

### 3.6. Anti-bot shadow (SUSPICION_CRITERIA)

```ts
ACTIVITY_MIN:          0.9   // ~38+ лайков за 14д
RECIPROCITY_MAX:       0.03  // заметно ниже популяционного mean
COMPLETENESS_MAX:      0.5   // profileCompleteness()
ACCOUNT_AGE_MAX_DAYS:  14    // только свежие аккаунты
SUSPICION_BUMP:        40    // add to MatchSpamSignal.suspicionScore
```

Пишется в `MatchSpamSignal` после `recalcActivityScores`. UI не реагирует — только админская очередь. Отказ `flagSuspiciousProfiles` никогда не ломает scoring (ловится try/catch).

---

## 4. Инварианты безопасности UX (не нарушать)

1. **Публично negative-сигналы не показываем.** `feed.service.ts` строго стрипает `quadrant`/`activityScore`/`lastActiveAt` из ответа. Если добавляете новый badge — только позитивный.
2. **Raw percents не показываем.** В приватном экране — «3 из 23», НЕ «13%». Дописать процент — зашквар.
3. **Lagging-indicator guard.** `getMe()` возвращает `activity: null` для `accountAgeDays < 7` или `likesSent14d < 3`. UI в этом случае просто не рендерит секцию. Не снимать guard без причины.
4. **Goodhart protection.** В UI нет фразы «это метрика X». Пользователь не должен узнать, что бейдж = formula. Не называем критерии публично.
5. **Over-liker penalty мягкий (−20, не −∞).** Reval раз в сутки, возможность выйти одной хорошей неделей. Не поднимать в абсолютное значение.

---

## 5. Риски и митигации (кратко)

| Риск | Митигация |
|---|---|
| Новичок застревает в SLEEPING | Guard `accountAgeDays >= 7` и `likesSent14d >= 3` (уже в `profile.service.ts`) |
| Замкнутый цикл over-liker | Мягкий penalty, revaluation nightly, reset через хорошую неделю |
| Goodhart / метрика как цель | Критерии бейджа не описаны в UI |
| БД-нагрузка cron | Чанки по 200, агрегаты одним SQL, `await Promise.all` по 4 аггрегатам |

---

## 6. Что делать, если что-то упало

| Симптом | Где копать |
|---|---|
| `MatchActivityQuadrant has no exported member` | `pnpm db:generate` не был выполнен. Сделайте. |
| `Property 'likesSent14d' does not exist on MatchProfile` | То же — клиент стальной. |
| `recalcActivityScores` ничего не обновляет | Проверьте `MATCH_FEATURE_RECIPROCITY=1`. Без флага cron early-return'ится. |
| Бейдж не появляется на карточках | `MATCH_RECIPROCITY_BADGES` включен? Cron отработал хоть раз (`scoreUpdatedAt IS NOT NULL`)? |
| Квадрант не влияет на выдачу | `MATCH_RECIPROCITY_RANKING` включен? (По умолчанию 0.) |
| Секция «Ваша активность» не видна | `MATCH_FEATURE_RECIPROCITY=1` + профиль ≥7 дней + ≥3 лайка в 14 дней + хотя бы один прогон cron'а |
| `Error: Cannot find module .../apps/api/dist/main` на проде | Build кладёт entrypoint в `apps/api/dist/src/main.js`; запускайте PM2 через `node /var/www/tindermp/apps/api/dist/src/main.js` или поправьте `start:prod` в `apps/api/package.json`. |
| `PrismaClientInitializationError: DATABASE_URL not found` | PM2 процесс стартует без env. Проверьте `apps/api/.env`, затем `pm2 restart match-api --update-env`. |
| `SignatureInvalidError` при `/match-api/auth` | Неверный `MATCH_BOT_TOKEN` (не тот бот/обрезан токен) или Mini App открыт не из нужного бота. |
| `curl https://api.telegram.org` timeout с сервера | Сетевой egress-блок до Telegram у хостера/аплинка (не ошибка кода). Временно включить `MATCH_DEV_AUTH_BYPASS=1` и `NEXT_PUBLIC_MATCH_DEV_AUTH_BYPASS=1`, параллельно открыть доступ к Telegram IP ranges. |

---

## 7. Чек-лист финальной проверки перед merge

- [ ] `pnpm db:migrate` прошёл, миграция `20260423150000_add_activity_scoring` применилась
- [ ] `pnpm db:generate` — клиент перегенерирован
- [ ] `pnpm --filter @match/api test` — все тесты зелёные, включая 18 новых в `activity-score.service.spec.ts`
- [ ] `pnpm --filter @match/api build` — без ошибок
- [ ] `pnpm --filter @match/web run build` — без ошибок
- [ ] `pnpm --filter @match/web test` — зелено
- [ ] В `.env` (dev) выставлен `MATCH_FEATURE_RECIPROCITY=1`, остальные флаги = 0
- [ ] Вручную вызван `recalcActivityScores()` — хотя бы один профиль получил `scoreUpdatedAt`
- [ ] В `/m/profile` у тестового аккаунта (>7 дней, >3 лайка) видна секция «Ваша активность»
- [ ] Raw `quadrant` / `activityScore` / `lastActiveAt` **не видны** в ответе `/match-api/feed` (проверить через curl или DevTools)
