import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventLoggerService } from './event-logger.service';
import {
  addDaysUtc,
  generateInviteCode,
  INVITE_CONFIG,
  normalizeInviteCode,
} from './match.utils';

@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLogger: EventLoggerService,
  ) {}

  private logRedeemFailure(
    code: string,
    newProfileId: string,
    reason: 'invalid' | 'revoked' | 'already_used',
  ): void {
    void this.eventLogger.log({
      profileId: newProfileId,
      type: 'INVITE_REDEEMED',
      payload: {
        code,
        reason,
        attemptedBy: newProfileId,
        status: 'failed',
      },
    });
  }

  private async createCodes(
    tx: Prisma.TransactionClient,
    data: Array<{ ownerProfileId: string | null; source: 'user' | 'admin' }>,
  ) {
    const createdIds: string[] = [];
    for (const item of data) {
      let created = false;
      for (let i = 0; i < 10; i += 1) {
        try {
          const row = await tx.matchInviteCode.create({
            data: {
              code: generateInviteCode(),
              ownerProfileId: item.ownerProfileId,
              source: item.source,
            },
            select: { id: true },
          });
          createdIds.push(row.id);
          created = true;
          break;
        } catch {
          void this.eventLogger.log({
            profileId: item.ownerProfileId ?? null,
            type: 'INVITE_ISSUED',
            payload: {
              action: 'invite_code_collision',
              ownerProfileId: item.ownerProfileId,
              source: item.source,
              attempt: i + 1,
            },
          });
        }
      }
      if (!created) {
        throw new BadRequestException('invite_code_generation_failed');
      }
    }
    return tx.matchInviteCode.findMany({
      where: { id: { in: createdIds } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Атомарно «сжигает» инвайт-код при создании нового профиля.
   *
   * Защита от повторного использования здесь в три слоя:
   *  1. Мы ищем код только среди активных (`usedAt = null`, `revokedAt = null`).
   *  2. Атомарный `updateMany` с WHERE на те же поля + `usedByProfileId: null`
   *     гарантирует, что только одна конкурирующая транзакция проставит поля.
   *  3. На уровне схемы `MatchInviteCode.usedByProfileId` помечен как `@unique`,
   *     поэтому БД никогда не даст двум профилям привязаться к одному коду —
   *     P2002 вернётся как `ConflictException`.
   */
  async redeemForProfileCreation(
    tx: Prisma.TransactionClient,
    codeRaw: string,
    newProfileId: string,
  ): Promise<void> {
    const code = normalizeInviteCode(codeRaw);

    // Сначала пытаемся найти код в любом состоянии, чтобы вернуть
    // осмысленную ошибку пользователю.
    const existing = await tx.matchInviteCode.findUnique({
      where: { code },
      select: {
        id: true,
        usedAt: true,
        revokedAt: true,
        usedByProfileId: true,
      },
    });

    if (!existing) {
      this.logger.warn(
        `invite redeem rejected: code ${code} not found (profile=${newProfileId})`,
      );
      this.logRedeemFailure(code, newProfileId, 'invalid');
      throw new BadRequestException({ code: 'invite_invalid' });
    }

    if (existing.revokedAt) {
      this.logger.warn(
        `invite redeem rejected: code ${code} revoked (profile=${newProfileId})`,
      );
      this.logRedeemFailure(code, newProfileId, 'revoked');
      throw new BadRequestException({ code: 'invite_revoked' });
    }

    // Idempotency: если код уже принадлежит этому же профилю — это retry
    // того же запроса (например, клиент перепослал из-за сетевого таймаута).
    // Возвращаем без ошибки, чтобы не ломать повторный upsertProfile.
    if (existing.usedByProfileId === newProfileId) {
      this.logger.log(
        `invite redeem idempotent: code ${code} already claimed by ${newProfileId}`,
      );
      return;
    }

    if (existing.usedAt || existing.usedByProfileId) {
      this.logger.warn(
        `invite redeem rejected: code ${code} already used by profile=${existing.usedByProfileId} (attempted by profile=${newProfileId})`,
      );
      this.logRedeemFailure(code, newProfileId, 'already_used');
      throw new ConflictException({ code: 'invite_already_used' });
    }

    // Атомарный claim: WHERE содержит все три «active-предиката», так что
    // параллельный второй redeem с тем же кодом не найдёт совпадения.
    try {
      const updated = await tx.matchInviteCode.updateMany({
        where: {
          id: existing.id,
          usedAt: null,
          revokedAt: null,
          usedByProfileId: null,
        },
        data: { usedAt: new Date(), usedByProfileId: newProfileId },
      });
      if (updated.count !== 1) {
        this.logger.warn(
          `invite redeem race lost: code ${code} was claimed concurrently (profile=${newProfileId})`,
        );
        this.logRedeemFailure(code, newProfileId, 'already_used');
        throw new ConflictException({ code: 'invite_already_used' });
      }
    } catch (err) {
      // Prisma бросит P2002 если другой параллельный запрос успел проставить
      // тот же `usedByProfileId` быстрее (unique constraint).
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        this.logger.warn(
          `invite redeem unique-conflict on code ${code} (profile=${newProfileId})`,
        );
        this.logRedeemFailure(code, newProfileId, 'already_used');
        throw new ConflictException({ code: 'invite_already_used' });
      }
      throw err;
    }

    void this.eventLogger.log({
      profileId: newProfileId,
      type: 'INVITE_REDEEMED',
      payload: { code },
    });
  }

  async issueForProfile(
    profileId: string,
    count: number,
    source: 'user' | 'admin',
    txClient?: Prisma.TransactionClient,
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      const available = await tx.matchInviteCode.count({
        where: { ownerProfileId: profileId, usedAt: null, revokedAt: null },
      });
      const allowed = Math.max(
        0,
        Math.min(count, INVITE_CONFIG.MAX_BALANCE - available),
      );
      if (allowed <= 0) return [];
      return this.createCodes(
        tx,
        Array.from({ length: allowed }).map(() => ({
          ownerProfileId: profileId,
          source,
        })),
      );
    };
    const issued = txClient
      ? await run(txClient)
      : await this.prisma.$transaction(run);
    for (const row of issued) {
      void this.eventLogger.log({
        profileId,
        type: 'INVITE_ISSUED',
        payload: { code: row.code, source },
      });
    }
    return issued;
  }

  async issueAdminFree(count: number, ownerProfileId?: string | null) {
    const rows = await this.prisma.$transaction(async (tx) => {
      return this.createCodes(
        tx,
        Array.from({ length: count }).map(() => ({
          ownerProfileId: ownerProfileId ?? null,
          source: 'admin',
        })),
      );
    });
    for (const row of rows) {
      void this.eventLogger.log({
        profileId: ownerProfileId ?? null,
        type: 'INVITE_ISSUED',
        payload: { code: row.code, source: 'admin' },
      });
    }
    return rows;
  }

  async revokeByCodeForOwner(profileId: string, codeRaw: string) {
    const code = normalizeInviteCode(codeRaw);
    const updated = await this.prisma.matchInviteCode.updateMany({
      where: {
        code,
        ownerProfileId: profileId,
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new BadRequestException({ code: 'invite_invalid' });
    }
    void this.eventLogger.log({
      profileId,
      type: 'INVITE_REVOKED',
      payload: { code },
    });
    return { ok: true };
  }

  async revokeById(codeId: string) {
    const row = await this.prisma.matchInviteCode.findUnique({
      where: { id: codeId },
      select: { id: true, usedAt: true, revokedAt: true },
    });
    if (!row) throw new NotFoundException('Invite not found');
    if (row.usedAt || row.revokedAt) return { ok: true };
    await this.prisma.matchInviteCode.update({
      where: { id: codeId },
      data: { revokedAt: new Date() },
    });
    void this.eventLogger.log({
      profileId: null,
      type: 'INVITE_REVOKED',
      payload: { codeId },
    });
    return { ok: true };
  }

  async listForProfile(profileId: string) {
    const [all, stats] = await Promise.all([
      this.prisma.matchInviteCode.findMany({
        where: { ownerProfileId: profileId },
        include: {
          usedBy: {
            select: {
              id: true,
              displayName: true,
              role: true,
              roleCustom: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.statsForProfile(profileId),
    ]);

    const available = all.filter(
      (invite) => !invite.usedAt && !invite.revokedAt,
    );
    const used = all.filter((invite) => !!invite.usedAt);
    const revoked = all.filter((invite) => !!invite.revokedAt);

    const mapInvite = (invite: (typeof all)[number]) => ({
      ...invite,
      invitee: invite.usedBy
        ? {
            displayName: invite.usedBy.displayName,
            role: invite.usedBy.role,
            roleCustom: invite.usedBy.roleCustom ?? null,
          }
        : null,
    });

    return {
      all: all.map(mapInvite),
      available: available.map(mapInvite),
      used: used.map(mapInvite),
      revoked: revoked.map(mapInvite),
      stats,
    };
  }

  async statsForProfile(profileId: string) {
    const [available, issued, activated, profile] = await Promise.all([
      this.prisma.matchInviteCode.count({
        where: { ownerProfileId: profileId, usedAt: null, revokedAt: null },
      }),
      this.prisma.matchInviteCode.count({
        where: { ownerProfileId: profileId },
      }),
      this.prisma.matchInviteCode.count({
        where: { ownerProfileId: profileId, usedAt: { not: null } },
      }),
      this.prisma.matchProfile.findUnique({
        where: { id: profileId },
        select: { nextInviteGrantAt: true },
      }),
    ]);
    return {
      invitesAvailable: available,
      invitesIssued: issued,
      invitesActivated: activated,
      nextGrantAt: profile?.nextInviteGrantAt ?? null,
    };
  }

  async listAdmin(params: { owner?: string; status?: string; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const where: Prisma.MatchInviteCodeWhereInput = {};
    if (params.owner) where.ownerProfileId = params.owner;
    if (params.status === 'available') where.usedAt = null;
    if (params.status === 'used') where.usedAt = { not: null };
    if (params.status === 'revoked') where.revokedAt = { not: null };
    return this.prisma.matchInviteCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        owner: { select: { id: true, displayName: true, role: true } },
        usedBy: { select: { id: true, displayName: true, role: true } },
      },
    });
  }

  async inviteTree(profileId: string) {
    const levels: Array<Array<{ profileId: string; children: string[] }>> = [];
    let currentLevel = [profileId];

    for (let depth = 0; depth < 3 && currentLevel.length > 0; depth += 1) {
      const rows = await this.prisma.matchInviteCode.findMany({
        where: {
          ownerProfileId: { in: currentLevel },
          usedByProfileId: { not: null },
        },
        select: { ownerProfileId: true, usedByProfileId: true },
      });
      const map = new Map<string, string[]>();
      for (const row of rows) {
        if (!row.ownerProfileId || !row.usedByProfileId) continue;
        map.set(row.ownerProfileId, [
          ...(map.get(row.ownerProfileId) ?? []),
          row.usedByProfileId,
        ]);
      }
      levels.push(
        currentLevel.map((id) => ({
          profileId: id,
          children: map.get(id) ?? [],
        })),
      );
      currentLevel = Array.from(
        new Set(
          rows.map((row) => row.usedByProfileId).filter(Boolean) as string[],
        ),
      );
    }
    return { root: profileId, levels };
  }

  async bootstrapExistingProfiles() {
    const profiles = await this.prisma.matchProfile.findMany({
      select: { id: true, nextInviteGrantAt: true },
    });
    for (const profile of profiles) {
      await this.issueForProfile(
        profile.id,
        INVITE_CONFIG.INITIAL_GRANT,
        'user',
      );
      if (!profile.nextInviteGrantAt) {
        await this.prisma.matchProfile.update({
          where: { id: profile.id },
          data: {
            nextInviteGrantAt: addDaysUtc(
              new Date(),
              INVITE_CONFIG.PERIODIC_INTERVAL_DAYS,
            ),
          },
        });
      }
    }
  }
}
