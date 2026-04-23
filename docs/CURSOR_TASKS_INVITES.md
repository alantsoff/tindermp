# Match-app — фиксы и follow-up по инвайт-кодам

> Задача для Cursor. Первая часть уже внесена в код — проверь её, не откатывай. Вторая часть (P1–P3) — твои конкретные шаги. Сначала P0-блок «что уже сделано» — чтобы ты не переписал это по-своему.

---

## P0 — что уже в коде (проверить, не трогать)

### Бэкенд

**Файл:** `apps/api/src/modules/match/profile.service.ts`

В `upsertProfile` логика разделена на два флага:

```ts
const inviteOnlyEnabled = this.isInviteOnlyEnabled();
const isAdminCreation =
  this.isAdminTelegramId(user?.telegramId) ||
  this.isInviteBypassUsername(user?.telegramUsername);

// Требуется ли код для создания (env-управляемо, обходится админом)
const inviteRequired =
  inviteOnlyEnabled && !existingProfile && !isAdminCreation;

// Расходуется ли код (всегда при наличии, независимо от флага)
const shouldRedeemInvite = !existingProfile && Boolean(inviteCode);
```

Это осознанное изменение — раньше код не сжигался при `MATCH_INVITE_ONLY=0`. Не возвращай старый вариант, где `redeemForProfileCreation` вызывался только при `inviteRequired`.

**Файл:** `apps/api/src/modules/match/invite.service.ts`

Метод `redeemForProfileCreation` теперь:

- сначала читает состояние кода через `findUnique`;
- возвращает три разных ошибки вместо одной:
  - `invite_invalid` → `BadRequestException` (400) — кода нет
  - `invite_revoked` → `BadRequestException` (400) — отозван
  - `invite_already_used` → `ConflictException` (409) — уже использован
- `updateMany` c `WHERE { usedAt: null, revokedAt: null, usedByProfileId: null }` — атомарный claim;
- перехватывает Prisma `P2002` (unique conflict на `usedByProfileId @unique`) и тоже отдаёт `invite_already_used`;
- логирует через `private readonly logger = new Logger(InviteService.name)` каждую отклонённую попытку с кодом и `profileId`.

Это три слоя защиты — не объединяй их в один запрос, не убирай логирование.

### Клиент

**Файл:** `apps/web/app/m/onboarding/page.tsx`

Обработчик ошибок `catch` в `onSubmit` знает про все четыре кода:

```ts
if (
  message.includes('invite_required') ||
  message.includes('invite_invalid') ||
  message.includes('invite_revoked') ||
  message.includes('invite_already_used')
) {
  window.sessionStorage.setItem('matchInviteError', reason);
  router.replace('/m/invite');
  return;
}
```

**Файл:** `apps/web/app/m/_components/MatchInviteClient.tsx`

`useEffect` с `await Promise.resolve()` читает `sessionStorage.matchInviteError` один раз и показывает в форме ввода кода.

---

## P1 — backfill скрипт для «потерянных» инвайтов (обязательный)

**Проблема:** до фикса в пункте P0 коды расходовались только при `MATCH_INVITE_ONLY=1`. Если флаг был выключен, но пользователь вводил код — `usedAt` остался `null`, и код сейчас числится активным, хотя реально на него уже зарегистрировался профиль.

**Что нужно:** one-off скрипт, который восстанавливает `usedAt` и `usedByProfileId` по событиям `MatchEventLog.type = INVITE_REDEEMED`.

### 1.1 Создать файл `apps/api/scripts/backfill-invite-usage.ts`

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Payload = { code?: string };

async function main() {
  const events = await prisma.matchEventLog.findMany({
    where: { type: 'INVITE_REDEEMED' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      profileId: true,
      payload: true,
      createdAt: true,
    },
  });

  let fixed = 0;
  let alreadyOk = 0;
  let skipped = 0;

  for (const event of events) {
    if (!event.profileId) {
      skipped += 1;
      continue;
    }
    const payload = (event.payload ?? null) as Payload | null;
    const code = payload?.code?.trim().toUpperCase();
    if (!code) {
      skipped += 1;
      continue;
    }
    const invite = await prisma.matchInviteCode.findUnique({
      where: { code },
      select: { id: true, usedAt: true, usedByProfileId: true },
    });
    if (!invite) {
      skipped += 1;
      continue;
    }
    if (invite.usedAt && invite.usedByProfileId === event.profileId) {
      alreadyOk += 1;
      continue;
    }
    // Осторожно: не перезаписываем код, который успели использовать иначе.
    if (invite.usedByProfileId && invite.usedByProfileId !== event.profileId) {
      console.warn(
        `[skip] code=${code} already tied to ${invite.usedByProfileId}, event profile=${event.profileId}`,
      );
      skipped += 1;
      continue;
    }
    await prisma.matchInviteCode.update({
      where: { id: invite.id },
      data: {
        usedAt: event.createdAt,
        usedByProfileId: event.profileId,
      },
    });
    fixed += 1;
    console.log(`[fix] code=${code} → profile=${event.profileId}`);
  }

  console.log(
    JSON.stringify({ totalEvents: events.length, fixed, alreadyOk, skipped }, null, 2),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### 1.2 Добавить скрипт в `apps/api/package.json`

```diff
   "scripts": {
+    "backfill:invites": "tsx scripts/backfill-invite-usage.ts",
     ...
   }
```

Если `tsx` ещё не в devDependencies — добавить: `pnpm --filter @match/api add -D tsx`.

### 1.3 Запуск в проде

```bash
# dry-run имеет смысл добавить опцию, но для простоты сначала прогнать на staging-дампе
pnpm --filter @match/api run backfill:invites
```

**Acceptance:** запустить на staging-копии прод-БД, посмотреть `fixed` > 0 и `skipped` осмысленно малый. Потом прогнать на проде.

---

## P2 — дополнительные защиты

### 2.1 Повторная попытка после 409

**Файл:** `apps/web/app/m/onboarding/page.tsx`

Сейчас при `invite_already_used` пользователь молча уходит на `/m/invite` с сообщением. Добавь очистку `sessionStorage.matchInviteCode` перед редиректом, чтобы форма не предзаполнялась тем же неверным кодом:

```ts
if (typeof window !== 'undefined') {
  window.sessionStorage.removeItem('matchInviteCode');
}
```

Уже частично сделано внутри фикса, но проверь что оно срабатывает **перед** `router.replace('/m/invite')`, а не после.

### 2.2 Backend тест — race на один код

**Файл:** `apps/api/src/modules/match/invite.service.spec.ts` (новый)

Добавь юнит-тест с мокнутым Prisma `$transaction`:

```ts
import { ConflictException } from '@nestjs/common';
import { InviteService } from './invite.service';

describe('InviteService.redeemForProfileCreation', () => {
  const eventLogger = { log: jest.fn() };

  const buildService = (txOverrides: Record<string, unknown> = {}) => {
    const tx = {
      matchInviteCode: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      ...txOverrides,
    } as any;
    const prisma = { $transaction: jest.fn() } as any;
    const service = new InviteService(prisma, eventLogger as any);
    return { service, tx };
  };

  it('throws invite_already_used when code is already claimed', async () => {
    const { service, tx } = buildService();
    tx.matchInviteCode.findUnique.mockResolvedValue({
      id: 'i1',
      usedAt: new Date(),
      revokedAt: null,
      usedByProfileId: 'other-profile',
    });
    await expect(
      service.redeemForProfileCreation(tx, 'ABCD-EFGH', 'new'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws invite_already_used when concurrent redeem wins the race', async () => {
    const { service, tx } = buildService();
    tx.matchInviteCode.findUnique.mockResolvedValue({
      id: 'i1',
      usedAt: null,
      revokedAt: null,
      usedByProfileId: null,
    });
    tx.matchInviteCode.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.redeemForProfileCreation(tx, 'ABCD-EFGH', 'new'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
```

### 2.3 Админский аудит

**Файл:** `apps/api/src/modules/match-admin/match-admin.service.ts`

В методе `invites(...)` при `status === 'used'` добавь поле `usedAt` и `usedByProfileId` в include — чтобы админка показывала кто и когда использовал код. Сейчас возвращается только `usedBy.displayName` — этого мало для разбора инцидентов.

---

## P3 — нагрузочный тест (необязательно)

Напиши `apps/api/test/invite-redeem.concurrent.e2e-spec.ts` — запустить 20 параллельных запросов с одним кодом против in-memory или test-db. Утверждать: ровно один получил 200, остальные — 409.

---

## Как проверить, что всё работает

```bash
# 1. Типы + линт
pnpm --filter @match/api exec tsc --noEmit -p tsconfig.json
pnpm --filter @match/api run lint
pnpm --filter @match/web exec tsc --noEmit -p tsconfig.json
pnpm --filter @match/web run lint

# 2. Юнит-тесты
pnpm --filter @match/api run test

# 3. Прогон скрипта бэкфилла на staging
pnpm --filter @match/api run backfill:invites

# 4. Ручная проверка сценариев
#    a) создать 2 активных кода у профиля A
#    b) ввести один из них при регистрации нового B — код перекрашивается в "использован", показывается displayName B
#    c) попробовать тот же код на C — фронт редиректит на /m/invite с текстом "Этот инвайт-код уже использован"
#    d) отозвать код через /m/profile/invites — статус "отозван", редактирование профиля без инвайта работает (не проверяет код повторно)
#    e) админский аккаунт без кода регистрируется, ничего не сжигает
```

Acceptance для ручной проверки: (b), (c), (d), (e) отрабатывают как описано.

---

## Что сказать мне, когда закончишь

- Сколько записей восстановил `backfill:invites` (json-вывод в конце)
- Приложить скриншот `/m/profile → 🎟 Приглашения` с пометкой «использован» у кода, который был восстановлен скриптом
- Подтверждение что ручная проверка (a)–(e) прошла
