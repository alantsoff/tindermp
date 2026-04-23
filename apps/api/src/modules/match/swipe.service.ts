import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULTS } from './match.constants';
import { EventLoggerService } from './event-logger.service';
import {
  addDaysUtc,
  daysBetween,
  getNumberEnv,
  isFeatureEnabled,
  startOfMoscowDay,
  startOfUtcDay,
} from './match.utils';
import { sendTelegramMessage } from '../telegram/telegram-send';

function normalizePairIds(
  a: string,
  b: string,
): { profileAId: string; profileBId: string } {
  return a < b
    ? { profileAId: a, profileBId: b }
    : { profileAId: b, profileBId: a };
}

@Injectable()
export class SwipeService {
  private readonly logger = new Logger(SwipeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventLogger: EventLoggerService,
  ) {}

  private getLikeLimitPerDay(): number {
    return getNumberEnv(
      process.env.MATCH_LIKE_LIMIT_PER_DAY,
      DEFAULTS.MATCH_LIKE_LIMIT_PER_DAY,
    );
  }

  private getUndoCooldownSeconds(): number {
    return getNumberEnv(
      process.env.MATCH_UNDO_COOLDOWN_SECONDS,
      DEFAULTS.MATCH_UNDO_COOLDOWN_SECONDS,
    );
  }

  private getSwipeResetCooldownDays(): number {
    return getNumberEnv(
      process.env.MATCH_SWIPE_RESET_COOLDOWN_DAYS,
      DEFAULTS.MATCH_SWIPE_RESET_COOLDOWN_DAYS,
    );
  }

  private isAutoSwipeResetEnabled(): boolean {
    return isFeatureEnabled(process.env.MATCH_AUTO_SWIPE_RESET, false);
  }

  private getAutoResetInactivityThresholdDays(): number {
    return getNumberEnv(
      process.env.MATCH_AUTO_RESET_INACTIVITY_THRESHOLD_DAYS,
      DEFAULTS.MATCH_AUTO_RESET_INACTIVITY_THRESHOLD_DAYS,
    );
  }

  private async notifyIncomingLike(telegramId: string): Promise<void> {
    const token = process.env.MATCH_BOT_TOKEN?.trim();
    const miniAppUrl = process.env.MATCH_MINIAPP_URL?.trim();
    if (!token || !miniAppUrl) return;

    await sendTelegramMessage(
      token,
      telegramId,
      '❤️ Кому-то понравился ваш профиль в Match. Загляните в ленту — возможно, там ваш будущий мэтч.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Открыть Match', web_app: { url: miniAppUrl } }],
          ],
        },
      },
    );
  }

  private async notifyNewMatch(
    pairId: string,
    left: {
      telegramId: string;
      partnerName: string;
      partnerHeadline: string | null;
    },
    right: {
      telegramId: string;
      partnerName: string;
      partnerHeadline: string | null;
    },
  ): Promise<void> {
    const token = process.env.MATCH_BOT_TOKEN?.trim();
    const miniAppUrl = process.env.MATCH_MINIAPP_URL?.trim();
    if (!token || !miniAppUrl) return;

    const send = async (item: {
      telegramId: string;
      partnerName: string;
      partnerHeadline: string | null;
    }) => {
      await sendTelegramMessage(
        token,
        item.telegramId,
        `🔥 У вас новый матч с ${item.partnerName}!\n${item.partnerHeadline ?? ''}`.trim(),
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'Открыть чат',
                  web_app: { url: `${miniAppUrl}?pair=${pairId}` },
                },
              ],
            ],
          },
        },
      );
    };

    await Promise.all([send(left), send(right)]);
  }

  private async swipeInternal(
    profileId: string,
    toProfileId: string,
    direction: 'LIKE' | 'PASS',
    options?: { isSuperLike?: boolean; consumeSuperLike?: boolean },
  ) {
    const isSuperLike = options?.isSuperLike ?? false;
    const consumeSuperLike = options?.consumeSuperLike ?? false;

    if (profileId === toProfileId) {
      throw new BadRequestException('Cannot swipe yourself');
    }

    const [fromProfile, toProfile] = await Promise.all([
      this.prisma.matchProfile.findUnique({
        where: { id: profileId },
        include: { user: { select: { telegramId: true } } },
      }),
      this.prisma.matchProfile.findUnique({
        where: { id: toProfileId },
        include: { user: { select: { telegramId: true } } },
      }),
    ]);
    if (!fromProfile) throw new NotFoundException('Profile not found');
    if (!toProfile) throw new NotFoundException('Target profile not found');
    if (fromProfile.bannedAt) {
      throw new BadRequestException('profile_banned');
    }

    if (direction === 'LIKE' && !isSuperLike) {
      const likeCountToday = await this.prisma.matchSwipe.count({
        where: {
          fromProfileId: profileId,
          direction: 'LIKE',
          isSuperLike: false,
          createdAt: { gte: startOfMoscowDay(new Date()) },
        },
      });
      const likeLimit = this.getLikeLimitPerDay();
      if (likeCountToday >= likeLimit) {
        const resetAt = addDaysUtc(startOfMoscowDay(new Date()), 1);
        throw new HttpException(
          { code: 'like_limit_reached', resetAt: resetAt.toISOString() },
          429,
        );
      }
    }

    const previousSwipe = await this.prisma.matchSwipe.findUnique({
      where: {
        fromProfileId_toProfileId: {
          fromProfileId: profileId,
          toProfileId,
        },
      },
      select: { direction: true, isSuperLike: true },
    });

    let pairId: string | null = null;
    let matched = false;
    let shouldNotifyIncomingLike = false;

    await this.prisma.$transaction(async (tx) => {
      if (consumeSuperLike) {
        const spend = await tx.matchProfile.updateMany({
          where: { id: profileId, superLikeBalance: { gt: 0 } },
          data: { superLikeBalance: { decrement: 1 } },
        });
        if (spend.count === 0) {
          throw new HttpException({ code: 'no_super_likes' }, 402);
        }
      }

      await tx.matchSwipe.upsert({
        where: {
          fromProfileId_toProfileId: {
            fromProfileId: profileId,
            toProfileId,
          },
        },
        update: {
          direction,
          isSuperLike,
          createdAt: new Date(),
        },
        create: {
          fromProfileId: profileId,
          toProfileId,
          direction,
          isSuperLike,
        },
      });

      if (
        direction === 'LIKE' &&
        isFeatureEnabled(process.env.MATCH_FEATURE_STREAKS, true)
      ) {
        const today = startOfUtcDay(new Date());
        const lastDay = fromProfile.swipeStreakLastDay
          ? startOfUtcDay(new Date(fromProfile.swipeStreakLastDay))
          : null;
        let newStreak = fromProfile.swipeStreakDays ?? 0;
        let awardSuperLike = 0;

        if (!lastDay || lastDay < today) {
          const continuation = !!lastDay && daysBetween(lastDay, today) === 1;
          newStreak = continuation ? newStreak + 1 : 1;
          if (newStreak > 0 && newStreak % 7 === 0) awardSuperLike = 1;
        }

        await tx.matchProfile.update({
          where: { id: fromProfile.id },
          data: {
            swipeStreakDays: newStreak,
            swipeStreakLastDay: today,
            superLikeBalance: { increment: awardSuperLike },
          },
        });
      }

      if (direction !== 'LIKE') return;

      const mirror = await tx.matchSwipe.findUnique({
        where: {
          fromProfileId_toProfileId: {
            fromProfileId: toProfileId,
            toProfileId: profileId,
          },
        },
        select: { direction: true },
      });

      if (!mirror || mirror.direction !== 'LIKE') {
        if (previousSwipe?.direction !== 'LIKE') {
          shouldNotifyIncomingLike = true;
        }
        return;
      }
      matched = true;
      const pairKeys = normalizePairIds(profileId, toProfileId);
      const pair = await tx.matchPair.upsert({
        where: { profileAId_profileBId: pairKeys },
        update: {},
        create: pairKeys,
      });
      pairId = pair.id;
      await tx.matchPairRead.createMany({
        data: [
          { pairId: pair.id, profileId, lastReadAt: pair.createdAt },
          {
            pairId: pair.id,
            profileId: toProfileId,
            lastReadAt: pair.createdAt,
          },
        ],
        skipDuplicates: true,
      });
    });

    if (shouldNotifyIncomingLike) {
      void this.notifyIncomingLike(toProfile.user.telegramId).catch((error) => {
        this.logger.warn(`notifyIncomingLike failed: ${String(error)}`);
      });
    }

    void this.eventLogger.log({
      profileId,
      type:
        direction === 'PASS'
          ? 'SWIPE_PASS'
          : isSuperLike
            ? 'SWIPE_SUPER'
            : 'SWIPE_LIKE',
      targetProfileId: toProfileId,
    });
    if (!matched || !pairId) {
      return { matched: false as const };
    }

    void this.notifyNewMatch(
      pairId,
      {
        telegramId: fromProfile.user.telegramId,
        partnerName: toProfile.displayName,
        partnerHeadline: toProfile.headline,
      },
      {
        telegramId: toProfile.user.telegramId,
        partnerName: fromProfile.displayName,
        partnerHeadline: fromProfile.headline,
      },
    ).catch((error) => {
      this.logger.warn(`notifyNewMatch failed: ${String(error)}`);
    });
    void this.eventLogger.log({
      profileId,
      type: 'MATCH_CREATED',
      targetProfileId: toProfileId,
      payload: { pairId },
    });
    void this.eventLogger.log({
      profileId: toProfileId,
      type: 'MATCH_CREATED',
      targetProfileId: profileId,
      payload: { pairId },
    });

    return {
      matched: true as const,
      pairId,
      partner: {
        id: toProfile.id,
        displayName: toProfile.displayName,
        avatarUrl: toProfile.avatarUrl,
        role: toProfile.role,
        roleCustom: toProfile.roleCustom,
        telegramContact: toProfile.telegramContact,
      },
    };
  }

  async swipe(
    profileId: string,
    toProfileId: string,
    direction: 'LIKE' | 'PASS',
  ) {
    return this.swipeInternal(profileId, toProfileId, direction, {
      isSuperLike: false,
      consumeSuperLike: false,
    });
  }

  async superSwipe(profileId: string, toProfileId: string) {
    return this.swipeInternal(profileId, toProfileId, 'LIKE', {
      isSuperLike: true,
      consumeSuperLike: true,
    });
  }

  async undoLastSwipe(profileId: string) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { id: profileId },
      select: { lastUndoAt: true },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    const cooldown = this.getUndoCooldownSeconds();
    if (profile.lastUndoAt) {
      const remainingMs =
        profile.lastUndoAt.getTime() + cooldown * 1000 - Date.now();
      if (remainingMs > 0) {
        throw new HttpException(
          {
            code: 'undo_cooldown',
            remainingSeconds: Math.ceil(remainingMs / 1000),
          },
          429,
        );
      }
    }

    const lastSwipe = await this.prisma.matchSwipe.findFirst({
      where: { fromProfileId: profileId },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastSwipe) {
      return { undone: false as const };
    }
    await this.prisma.$transaction(async (tx) => {
      if (lastSwipe.direction === 'LIKE') {
        const pairKeys = normalizePairIds(profileId, lastSwipe.toProfileId);
        await tx.matchPair.deleteMany({
          where: {
            profileAId: pairKeys.profileAId,
            profileBId: pairKeys.profileBId,
          },
        });
      }
      if (lastSwipe.isSuperLike) {
        await tx.matchProfile.update({
          where: { id: profileId },
          data: { superLikeBalance: { increment: 1 } },
        });
      }
      await tx.matchSwipe.delete({ where: { id: lastSwipe.id } });
      await tx.matchProfile.update({
        where: { id: profileId },
        data: { lastUndoAt: new Date() },
      });
    });
    void this.eventLogger.log({
      profileId,
      type: 'SWIPE_UNDO',
      targetProfileId: lastSwipe.toProfileId,
      payload: { direction: lastSwipe.direction },
    });
    return {
      undone: true as const,
      toProfileId: lastSwipe.toProfileId,
      direction: lastSwipe.direction,
    };
  }

  async previewReset(profileId: string) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { id: profileId },
      select: { createdAt: true, lastSwipeResetAt: true },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const resettableCount = await this.prisma.matchSwipe.count({
      where: { fromProfileId: profileId, direction: 'PASS' },
    });
    const autoResetEnabled = this.isAutoSwipeResetEnabled();
    const cooldownDays = this.getSwipeResetCooldownDays();
    const anchor = profile.lastSwipeResetAt ?? profile.createdAt;
    const nextAutoResetAt = autoResetEnabled
      ? addDaysUtc(anchor, cooldownDays).toISOString()
      : null;

    return {
      // Reset доступен всегда: ручной возврат PASS-карточек без кулдауна.
      canReset: true,
      resettableCount,
      nextAvailableAt: null,
      cooldownReason: undefined,
      autoResetEnabled,
      nextAutoResetAt,
    };
  }

  async reset(profileId: string): Promise<{ deletedCount: number }> {
    return this.resetInternal(profileId, { triggeredBy: 'manual' });
  }

  async resetInternal(
    profileId: string,
    { triggeredBy }: { triggeredBy: 'manual' | 'auto' | 'auto_catchup' },
  ): Promise<{ deletedCount: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.matchSwipe.deleteMany({
        where: { fromProfileId: profileId, direction: 'PASS' },
      });
      const updated = await tx.matchProfile.updateMany({
        where: { id: profileId },
        data: { lastSwipeResetAt: new Date() },
      });
      if (updated.count === 0) {
        throw new NotFoundException('Profile not found');
      }
      return { deletedCount: count };
    });
    void this.eventLogger.log({
      profileId,
      type: 'SWIPE_RESET',
      payload: { deletedCount: result.deletedCount, triggeredBy },
    });
    return result;
  }

  async maybeAutoCatchupReset(
    profileId: string,
    previousLastActiveAt: Date,
  ): Promise<void> {
    if (!this.isAutoSwipeResetEnabled()) return;
    const inactivityDays = this.getAutoResetInactivityThresholdDays();
    const inactiveThreshold = addDaysUtc(new Date(), -inactivityDays);
    if (previousLastActiveAt > inactiveThreshold) return;
    await this.resetInternal(profileId, { triggeredBy: 'auto_catchup' });
  }

  async getMatches(profileId: string) {
    const pairs = await this.prisma.matchPair.findMany({
      where: {
        OR: [{ profileAId: profileId }, { profileBId: profileId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pairs.length === 0) return [];

    const pairIds = pairs.map((pair) => pair.id);
    const partnerIds = pairs.map((pair) =>
      pair.profileAId === profileId ? pair.profileBId : pair.profileAId,
    );

    const [partners, lastMessages, unreadCounts, nonSystemPairs] =
      await Promise.all([
        this.prisma.matchProfile.findMany({
          where: { id: { in: partnerIds } },
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            role: true,
            roleCustom: true,
            niches: true,
          },
        }),
        this.prisma.$queryRaw<
          Array<{
            id: string;
            pairId: string;
            senderProfileId: string;
            body: string;
            systemGenerated: boolean;
            createdAt: Date;
          }>
        >(Prisma.sql`
        SELECT DISTINCT ON (m."pairId")
          m.id,
          m."pairId",
          m."senderProfileId",
          m.body,
          m."systemGenerated",
          m."createdAt"
        FROM "MatchMessage" m
        WHERE m."pairId" IN (${Prisma.join(pairIds)})
        ORDER BY m."pairId", m."createdAt" DESC
      `),
        this.prisma.$queryRaw<Array<{ pairId: string; unreadCount: bigint }>>(
          Prisma.sql`
          SELECT
            m."pairId",
            COUNT(*)::bigint AS "unreadCount"
          FROM "MatchMessage" m
          LEFT JOIN "MatchPairRead" r
            ON r."pairId" = m."pairId" AND r."profileId" = ${profileId}
          WHERE m."pairId" IN (${Prisma.join(pairIds)})
            AND m."senderProfileId" <> ${profileId}
            AND m."systemGenerated" = false
            AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
          GROUP BY m."pairId"
        `,
        ),
        this.prisma.matchMessage.groupBy({
          by: ['pairId'],
          where: { pairId: { in: pairIds }, systemGenerated: false },
        }),
      ]);
    const partnerById = new Map(
      partners.map((partner) => [partner.id, partner]),
    );
    const lastMessageByPair = new Map(
      lastMessages.map((message) => [message.pairId, message]),
    );
    const unreadCountByPair = new Map(
      unreadCounts.map((item) => [item.pairId, Number(item.unreadCount)]),
    );
    const pairsWithNonSystemMessages = new Set(
      nonSystemPairs.map((item) => item.pairId),
    );

    return pairs.map((pair) => {
      const partnerId =
        pair.profileAId === profileId ? pair.profileBId : pair.profileAId;
      const lastMessage = lastMessageByPair.get(pair.id) ?? null;
      const unreadCount = unreadCountByPair.get(pair.id) ?? 0;
      const isFirstMessageSystemOnly =
        !pairsWithNonSystemMessages.has(pair.id) || !lastMessage;
      return {
        id: pair.id,
        createdAt: pair.createdAt,
        lastMessageAt: lastMessage?.createdAt ?? null,
        hasUnread: unreadCount > 0,
        unreadCount,
        isFirstMessageSystemOnly,
        isArchived: pair.archivedByProfileIds.includes(profileId),
        partner: partnerById.get(partnerId) ?? null,
        lastMessage,
      };
    });
  }

  async markPairRead(pairId: string, profileId: string) {
    const pair = await this.prisma.matchPair.findUnique({
      where: { id: pairId },
    });
    if (!pair) throw new NotFoundException('Pair not found');
    if (pair.profileAId !== profileId && pair.profileBId !== profileId) {
      throw new BadRequestException('pair_access_denied');
    }
    await this.prisma.matchPairRead.upsert({
      where: { pairId_profileId: { pairId, profileId } },
      update: { lastReadAt: new Date() },
      create: { pairId, profileId, lastReadAt: new Date() },
    });
    return { ok: true };
  }

  async archivePair(pairId: string, profileId: string) {
    const pair = await this.prisma.matchPair.findUnique({
      where: { id: pairId },
    });
    if (!pair) throw new NotFoundException('Pair not found');
    if (pair.profileAId !== profileId && pair.profileBId !== profileId) {
      throw new BadRequestException('pair_access_denied');
    }
    if (!pair.archivedByProfileIds.includes(profileId)) {
      await this.prisma.matchPair.update({
        where: { id: pairId },
        data: { archivedByProfileIds: { push: profileId } },
      });
    }
    return { ok: true };
  }

  async unarchivePair(pairId: string, profileId: string) {
    const pair = await this.prisma.matchPair.findUnique({
      where: { id: pairId },
    });
    if (!pair) throw new NotFoundException('Pair not found');
    if (pair.profileAId !== profileId && pair.profileBId !== profileId) {
      throw new BadRequestException('pair_access_denied');
    }
    await this.prisma.matchPair.update({
      where: { id: pairId },
      data: {
        archivedByProfileIds: pair.archivedByProfileIds.filter(
          (id) => id !== profileId,
        ),
      },
    });
    return { ok: true };
  }

  /**
   * Возвращает список профилей, которым текущий пользователь поставил LIKE,
   * но которые ещё не ответили взаимным лайком (т.е. это ещё не матч, а
   * «в избранном»). Убранные вручную партнёры не попадают — Undo удаляет
   * запись из MatchSwipe, а матчи мы явно отфильтровываем.
   */
  async getFavorites(profileId: string) {
    const likes = await this.prisma.matchSwipe.findMany({
      where: {
        fromProfileId: profileId,
        direction: 'LIKE',
        // Исключаем тех, кто уже ответил взаимным лайком — они в /m/matches.
        NOT: {
          toProfile: {
            swipesFrom: {
              some: { toProfileId: profileId, direction: 'LIKE' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        toProfile: {
          select: {
            id: true,
            displayName: true,
            role: true,
            roleCustom: true,
            headline: true,
            city: true,
            niches: true,
            avatarUrl: true,
            bannedAt: true,
            pausedUntil: true,
            photos: {
              select: { id: true, url: true, order: true },
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              take: 1,
            },
          },
        },
      },
    });
    const now = new Date();
    return likes.map((swipe) => ({
      swipeId: swipe.id,
      likedAt: swipe.createdAt,
      isSuperLike: swipe.isSuperLike,
      partner: {
        id: swipe.toProfile.id,
        displayName: swipe.toProfile.displayName,
        role: swipe.toProfile.role,
        roleCustom: swipe.toProfile.roleCustom,
        headline: swipe.toProfile.headline,
        city: swipe.toProfile.city,
        niches: swipe.toProfile.niches,
        avatarUrl:
          swipe.toProfile.avatarUrl ?? swipe.toProfile.photos[0]?.url ?? null,
        isAvailable:
          !swipe.toProfile.bannedAt &&
          (!swipe.toProfile.pausedUntil || swipe.toProfile.pausedUntil <= now),
      },
    }));
  }

  /**
   * Убирает профиль из «избранного», удаляя соответствующий LIKE-свайп.
   * Фактически это unlike — в будущем этого партнёра снова увидишь в ленте.
   */
  async removeFavorite(profileId: string, toProfileId: string) {
    if (profileId === toProfileId) {
      throw new BadRequestException('Cannot unlike yourself');
    }
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
    const { count } = await this.prisma.matchSwipe.deleteMany({
      where: {
        fromProfileId: profileId,
        toProfileId,
        direction: 'LIKE',
      },
    });
    if (count === 0) {
      throw new NotFoundException('favorite_not_found');
    }
    return { ok: true as const, removed: count };
  }
}
