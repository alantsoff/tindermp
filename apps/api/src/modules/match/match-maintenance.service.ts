import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityScoreService } from './activity-score.service';
import { DEFAULTS } from './match.constants';
import { InviteService } from './invite.service';
import { NotificationService } from './notification.service';
import { SwipeService } from './swipe.service';
import {
  addDaysUtc,
  getNumberEnv,
  INVITE_CONFIG,
  isFeatureEnabled,
  isInviteOnlyModeEnabled,
  pluralize,
} from './match.utils';

@Injectable()
export class MatchMaintenanceService {
  private readonly logger = new Logger(MatchMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inviteService: InviteService,
    private readonly swipeService: SwipeService,
    private readonly activityScoreService: ActivityScoreService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'Europe/Moscow' })
  async recalcLikeRateRecent() {
    const activeProfiles = await this.prisma.matchSwipe.findMany({
      where: { createdAt: { gte: addDaysUtc(new Date(), -30) } },
      select: { fromProfileId: true },
      distinct: ['fromProfileId'],
    });

    for (const item of activeProfiles) {
      const last100 = await this.prisma.matchSwipe.findMany({
        where: { fromProfileId: item.fromProfileId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { direction: true },
      });
      if (last100.length < 10) {
        await this.prisma.matchProfile.update({
          where: { id: item.fromProfileId },
          data: { likeRateRecent: null },
        });
        continue;
      }
      const likes = last100.filter(
        (swipe) => swipe.direction === 'LIKE',
      ).length;
      await this.prisma.matchProfile.update({
        where: { id: item.fromProfileId },
        data: { likeRateRecent: likes / last100.length },
      });
    }
  }

  /**
   * Nightly recompute of activity × reciprocity scores. Runs at 04:30
   * Moscow time — right after recalcLikeRateRecent so we don't fight
   * for connection slots, but while traffic is still minimal.
   *
   * Gated on MATCH_FEATURE_RECIPROCITY — shadow-write phase doesn't
   * require the flag to be visible in UI or ranking; those have their
   * own sub-flags (see docs/CURSOR_TASKS_ACTIVITY_SCORE.md §7).
   */
  @Cron('30 4 * * *', { timeZone: 'Europe/Moscow', name: 'activityScores' })
  async runActivityScores() {
    if (!isFeatureEnabled(process.env.MATCH_FEATURE_RECIPROCITY, false)) return;
    try {
      const result = await this.activityScoreService.recalcActivityScores();
      this.logger.log(`activityScores cron ok (${result.updated} profiles)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`activityScores cron failed: ${message}`);
    }
  }

  @Cron('0 12 * * *', { timeZone: 'Europe/Moscow' })
  async sendDailyDigest() {
    if (!isFeatureEnabled(process.env.MATCH_FEATURE_DIGEST, true)) return;

    const minFresh = getNumberEnv(
      process.env.MATCH_DIGEST_MIN_FRESH,
      DEFAULTS.MATCH_DIGEST_MIN_FRESH,
    );
    const now = new Date();
    const since7d = addDaysUtc(now, -7);
    const since20h = new Date(now.getTime() - 20 * 60 * 60 * 1000);
    const freshSince = addDaysUtc(now, -1);

    const candidates = await this.prisma.matchProfile.findMany({
      where: {
        isActive: true,
        lastActiveAt: { gte: since7d },
        AND: [
          { OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }] },
          {
            OR: [
              { lastDigestSentAt: null },
              { lastDigestSentAt: { lt: since20h } },
            ],
          },
        ],
      },
      select: { id: true },
      take: 500,
    });

    for (const profile of candidates) {
      const freshCount = await this.prisma.matchProfile.count({
        where: {
          id: { not: profile.id },
          isActive: true,
          createdAt: { gte: freshSince },
          OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
          AND: [
            {
              OR: [
                { settings: { is: null } },
                { settings: { is: { hideFromFeed: false } } },
              ],
            },
          ],
          swipesTo: { none: { fromProfileId: profile.id } },
        },
      });
      if (freshCount < minFresh) continue;

      // NotificationService сам пропустит, если notifyDigest=false или
      // master notificationsMuted=true. Поле lastDigestSentAt обновляем
      // в любом случае — иначе крон будет дёргать одного и того же
      // оптаут-юзера каждые сутки и забивать NOTIFICATION_THROTTLED.
      await this.notifications.send(profile.id, 'digest', {
        text: `📬 В вашей ленте ${freshCount} новых подходящих человека за сутки.`,
        meta: { freshCount },
      });
      await this.prisma.matchProfile.update({
        where: { id: profile.id },
        data: { lastDigestSentAt: new Date() },
      });
    }
  }

  @Cron('0 */3 * * *', { timeZone: 'Europe/Moscow' })
  async sendPendingLikesPing() {
    if (!isFeatureEnabled(process.env.MATCH_FEATURE_PENDING_LIKES, true))
      return;

    const now = new Date();
    const since6h = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const since20h = new Date(now.getTime() - 20 * 60 * 60 * 1000);

    const profiles = await this.prisma.matchProfile.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }] },
          {
            OR: [
              { lastPendingLikesPingAt: null },
              { lastPendingLikesPingAt: { lt: since20h } },
            ],
          },
        ],
      },
      select: { id: true },
      take: 1000,
    });

    for (const profile of profiles) {
      const count = await this.prisma.matchSwipe.count({
        where: {
          toProfileId: profile.id,
          direction: 'LIKE',
          createdAt: { gte: since6h },
          NOT: {
            fromProfile: {
              swipesFrom: {
                some: { toProfileId: profile.id, direction: 'LIKE' },
              },
            },
          },
        },
      });
      if (count < 3) continue;
      await this.notifications.send(profile.id, 'pending_likes', {
        text: `💌 Вас лайкнули ${count} человек. Откройте ленту, возможно это матч.`,
        meta: { count },
      });
      await this.prisma.matchProfile.update({
        where: { id: profile.id },
        data: { lastPendingLikesPingAt: new Date() },
      });
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'Europe/Moscow' })
  async autoResetPassedSwipes(): Promise<void> {
    if (!isFeatureEnabled(process.env.MATCH_AUTO_SWIPE_RESET, false)) return;

    const cooldownDays = getNumberEnv(
      process.env.MATCH_SWIPE_RESET_COOLDOWN_DAYS,
      DEFAULTS.MATCH_SWIPE_RESET_COOLDOWN_DAYS,
    );
    const inactivityDays = getNumberEnv(
      process.env.MATCH_AUTO_RESET_INACTIVITY_THRESHOLD_DAYS,
      DEFAULTS.MATCH_AUTO_RESET_INACTIVITY_THRESHOLD_DAYS,
    );

    const now = new Date();
    const cooldownThreshold = addDaysUtc(now, -cooldownDays);
    const inactivityThreshold = addDaysUtc(now, -inactivityDays);

    const candidates = await this.prisma.matchProfile.findMany({
      where: {
        isActive: true,
        bannedAt: null,
        lastActiveAt: { gte: inactivityThreshold },
        OR: [
          { lastSwipeResetAt: null, createdAt: { lte: cooldownThreshold } },
          { lastSwipeResetAt: { lte: cooldownThreshold } },
        ],
      },
      select: { id: true },
      take: 5000,
    });

    this.logger.log(`Auto-reset candidates: ${candidates.length}`);
    const batchSize = 50;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      for (const profile of batch) {
        try {
          const result = await this.swipeService.resetInternal(profile.id, {
            triggeredBy: 'auto',
          });
          if (result.deletedCount > 0) {
            await this.notifyAutoReset(profile.id, result.deletedCount);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`Auto-reset failed for ${profile.id}: ${message}`);
        }
      }
      if (i + batchSize < candidates.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async notifyAutoReset(
    profileId: string,
    deletedCount: number,
  ): Promise<void> {
    const text = `🔄 Ваша лента обновлена — вернули ${deletedCount} ${pluralize(
      deletedCount,
      'человека',
      'человека',
      'человек',
    )}. Возможно, среди них есть те, кого вы раньше пропустили.`;
    await this.notifications.send(profileId, 'auto_reset', {
      text,
      meta: { deletedCount },
    });
  }

  @Cron('0 3 * * *', { timeZone: 'Europe/Moscow' })
  async grantPeriodicInvites() {
    // Периодические гранты имеют смысл только в invite-only режиме.
    // Используем общий fail-safe helper — поведение должно совпадать
    // с ProfileService (чтобы не получилось «режим вкл, но гранты идут»
    // или наоборот).
    if (!isInviteOnlyModeEnabled()) return;
    const now = new Date();
    const activitySince = addDaysUtc(now, -INVITE_CONFIG.ACTIVITY_WINDOW_DAYS);
    const profiles = await this.prisma.matchProfile.findMany({
      where: {
        isActive: true,
        nextInviteGrantAt: { lte: now },
        lastActiveAt: { gte: activitySince },
      },
      select: { id: true },
      take: 5000,
    });

    for (const profile of profiles) {
      await this.inviteService.issueForProfile(
        profile.id,
        INVITE_CONFIG.PERIODIC_GRANT,
        'user',
      );
      await this.prisma.matchProfile.update({
        where: { id: profile.id },
        data: {
          nextInviteGrantAt: addDaysUtc(
            now,
            INVITE_CONFIG.PERIODIC_INTERVAL_DAYS,
          ),
        },
      });
    }
    this.logger.log(`Granted periodic invites for ${profiles.length} profiles`);
  }
}
