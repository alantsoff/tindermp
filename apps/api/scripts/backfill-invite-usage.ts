import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Payload = {
  code?: string;
  status?: string;
  reason?: string;
};

const DRY_RUN = process.env.DRY_RUN === '1';

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
  let skippedFailed = 0;
  let skippedMismatch = 0;
  let skippedNoPayload = 0;
  let skippedNoInvite = 0;

  for (const event of events) {
    if (!event.profileId) {
      skipped += 1;
      skippedNoPayload += 1;
      continue;
    }
    const payload = (event.payload ?? null) as Payload | null;

    // ВАЖНО: пропускаем события с `payload.status === 'failed'`.
    // После фикса от 2026-04 `redeemForProfileCreation` пишет события
    // `INVITE_REDEEMED` и для **неуспешных** попыток (с reason =
    // invalid | revoked | already_used). Если их сюда затащить — пометим
    // как использованные коды, которые реально не расходовались.
    if (payload?.status === 'failed') {
      skipped += 1;
      skippedFailed += 1;
      continue;
    }

    const code = payload?.code?.trim().toUpperCase();
    if (!code) {
      skipped += 1;
      skippedNoPayload += 1;
      continue;
    }
    const invite = await prisma.matchInviteCode.findUnique({
      where: { code },
      select: { id: true, usedAt: true, usedByProfileId: true, revokedAt: true },
    });
    if (!invite) {
      skipped += 1;
      skippedNoInvite += 1;
      continue;
    }
    if (invite.usedAt && invite.usedByProfileId === event.profileId) {
      alreadyOk += 1;
      continue;
    }
    if (invite.usedByProfileId && invite.usedByProfileId !== event.profileId) {
      console.warn(
        `[skip] event=${event.id} code=${code} already tied to ${invite.usedByProfileId}, event profile=${event.profileId}`,
      );
      skipped += 1;
      skippedMismatch += 1;
      continue;
    }
    if (invite.revokedAt) {
      // Код был отозван — не возвращаем его в «used», просто помечаем факт.
      console.warn(
        `[skip] event=${event.id} code=${code} revoked at ${invite.revokedAt.toISOString()} — keep as revoked`,
      );
      skipped += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(
        `[dry] event=${event.id} code=${code} -> profile=${event.profileId}`,
      );
      fixed += 1;
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
    console.log(
      `[fix] event=${event.id} code=${code} -> profile=${event.profileId}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        totalEvents: events.length,
        fixed,
        alreadyOk,
        skipped,
        breakdown: {
          failedEvents: skippedFailed,
          noInvite: skippedNoInvite,
          mismatch: skippedMismatch,
          noPayload: skippedNoPayload,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
