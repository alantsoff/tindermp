import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { MatchAdminService } from '../match-admin.service';

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

@Injectable()
export class MatchAdminCronService {
  private readonly logger = new Logger(MatchAdminCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: MatchAdminService,
  ) {}

  @Cron('0 2 * * *', { timeZone: 'Europe/Moscow' })
  async computeDailyAggregate(): Promise<void> {
    const day = startOfUtcDay(addDays(new Date(), -1));
    const nextDay = addDays(day, 1);

    const [
      newProfiles,
      activeProfiles,
      swipes,
      likes,
      superLikes,
      matches,
      messages,
      contactReveals,
      invitesIssued,
      invitesRedeemed,
    ] = await Promise.all([
      this.prisma.matchProfile.count({
        where: { createdAt: { gte: day, lt: nextDay } },
      }),
      this.prisma.matchProfile.count({
        where: { lastActiveAt: { gte: day, lt: nextDay } },
      }),
      this.prisma.matchSwipe.count({
        where: { createdAt: { gte: day, lt: nextDay } },
      }),
      this.prisma.matchSwipe.count({
        where: { createdAt: { gte: day, lt: nextDay }, direction: 'LIKE' },
      }),
      this.prisma.matchSwipe.count({
        where: { createdAt: { gte: day, lt: nextDay }, isSuperLike: true },
      }),
      this.prisma.matchPair.count({
        where: { createdAt: { gte: day, lt: nextDay } },
      }),
      this.prisma.matchMessage.count({
        where: { createdAt: { gte: day, lt: nextDay } },
      }),
      this.prisma.matchEventLog.count({
        where: {
          type: 'CONTACT_REVEALED',
          createdAt: { gte: day, lt: nextDay },
        },
      }),
      this.prisma.matchEventLog.count({
        where: { type: 'INVITE_ISSUED', createdAt: { gte: day, lt: nextDay } },
      }),
      this.prisma.matchEventLog.count({
        where: {
          type: 'INVITE_REDEEMED',
          createdAt: { gte: day, lt: nextDay },
        },
      }),
    ]);

    await this.prisma.matchDailyAggregate.upsert({
      where: { day },
      create: {
        day,
        newProfiles,
        activeProfiles,
        swipes,
        likes,
        superLikes,
        matches,
        messages,
        contactReveals,
        invitesIssued,
        invitesRedeemed,
      },
      update: {
        newProfiles,
        activeProfiles,
        swipes,
        likes,
        superLikes,
        matches,
        messages,
        contactReveals,
        invitesIssued,
        invitesRedeemed,
        computedAt: new Date(),
      },
    });
    this.logger.log(
      `Daily aggregate computed for ${day.toISOString().slice(0, 10)}`,
    );
  }

  @Cron('0 3 * * *', { timeZone: 'Europe/Moscow' })
  async recomputeSpamSignals(): Promise<void> {
    const result = await this.adminService.recomputeSpam();
    this.logger.log(`Spam recompute done for ${result.processed} profiles`);
  }
}
