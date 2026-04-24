import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  MatchMarketplace,
  MatchRole,
  MatchWorkFormat,
  Prisma,
} from '@prisma/client';
import type { MatchSpamSignal } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventLoggerService } from '../match/event-logger.service';
import { InviteService } from '../match/invite.service';
import {
  normalizeInviteCode,
  toAdminEmailByTelegramId,
} from '../match/match.utils';

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, value: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + value);
  return next;
}

function addHours(date: Date, value: number): Date {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + value);
  return next;
}

function alignToHourStartUtc(d: Date): Date {
  const t = new Date(d);
  t.setUTCMinutes(0, 0, 0);
  t.setUTCMilliseconds(0);
  return t;
}

/**
 * Приводит произвольную строку из query-параметра к значению enum'а
 * Prisma. Принимает value case-insensitive (админ может вбить `seller`,
 * `Seller`, `SELLER` — получим `SELLER`). Если значение не входит в
 * enum — возвращает null, чтобы вызывающий мог либо бросить 400, либо
 * проигнорировать фильтр.
 *
 * Без этой проверки Prisma получает неожиданную строку через
 * `where.role = params.role` и падает с 500
 * `Invalid value for argument 'role'. Expected MatchRole.`
 */
function coerceEnum<T extends string>(
  raw: string | undefined,
  enumObject: Record<string, T>,
): T | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (!upper) return null;
  const values = Object.values(enumObject) as string[];
  return values.includes(upper) ? (upper as T) : null;
}

@Injectable()
export class MatchAdminService {
  private readonly logger = new Logger(MatchAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inviteService: InviteService,
    private readonly eventLogger: EventLoggerService,
  ) {}

  private tokenSecret(): string {
    const secret = process.env.MATCH_JWT_SECRET?.trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'MATCH_JWT_SECRET is not configured',
      );
    }
    return secret;
  }

  private signConfirmToken(payload: Record<string, unknown>): string {
    const body = JSON.stringify({
      ...payload,
      exp: Date.now() + 10 * 60 * 1000,
    });
    const data = Buffer.from(body).toString('base64url');
    const sign = createHmac('sha256', this.tokenSecret())
      .update(data)
      .digest('hex');
    return `${data}.${sign}`;
  }

  private verifyConfirmToken(token: string): Record<string, unknown> {
    const [data, sign] = token.split('.');
    if (!data || !sign) throw new BadRequestException('confirm_token_invalid');
    const expected = createHmac('sha256', this.tokenSecret())
      .update(data)
      .digest('hex');
    if (expected !== sign)
      throw new BadRequestException('confirm_token_invalid');
    const parsed = JSON.parse(
      Buffer.from(data, 'base64url').toString(),
    ) as Record<string, unknown>;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      throw new BadRequestException('confirm_token_expired');
    }
    return parsed;
  }

  private async writeAudit(params: {
    adminUserId: string;
    action: string;
    targetProfileId?: string | null;
    reason?: string | null;
    payload?: Prisma.JsonValue;
  }) {
    await this.prisma.matchAdminAudit.create({
      data: {
        adminUserId: params.adminUserId,
        action: params.action,
        targetProfileId: params.targetProfileId ?? null,
        reason: params.reason ?? null,
        payload:
          params.payload === undefined
            ? undefined
            : params.payload === null
              ? Prisma.JsonNull
              : (params.payload as Prisma.InputJsonValue),
      },
    });
  }

  private async subtreeProfileIds(
    rootProfileId: string,
    maxDepth = 10,
  ): Promise<string[]> {
    const visited = new Set<string>([rootProfileId]);
    let current = [rootProfileId];
    for (let depth = 0; depth < maxDepth; depth += 1) {
      if (current.length === 0) break;
      const rows = await this.prisma.matchInviteCode.findMany({
        where: {
          ownerProfileId: { in: current },
          usedByProfileId: { not: null },
        },
        select: { usedByProfileId: true },
      });
      const next: string[] = [];
      for (const row of rows) {
        if (!row.usedByProfileId || visited.has(row.usedByProfileId)) continue;
        visited.add(row.usedByProfileId);
        next.push(row.usedByProfileId);
      }
      current = next;
    }
    return Array.from(visited);
  }

  async overview() {
    const now = new Date();
    const dayAgo = addDays(now, -1);
    const weekAgo = addDays(now, -7);
    const monthAgo = addDays(now, -30);

    const [
      dau,
      wau,
      mau,
      newProfiles7d,
      swipes24h,
      matches24h,
      redeems24h,
      topSpam,
      marketplaceDistribution,
      workFormatDistribution,
    ] = await Promise.all([
      this.prisma.matchProfile.count({
        where: { lastActiveAt: { gte: dayAgo } },
      }),
      this.prisma.matchProfile.count({
        where: { lastActiveAt: { gte: weekAgo } },
      }),
      this.prisma.matchProfile.count({
        where: { lastActiveAt: { gte: monthAgo } },
      }),
      this.prisma.matchProfile.count({
        where: { createdAt: { gte: weekAgo } },
      }),
      this.prisma.matchSwipe.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.matchPair.count({ where: { createdAt: { gte: dayAgo } } }),
      this.prisma.matchEventLog.count({
        where: { type: 'INVITE_REDEEMED', createdAt: { gte: dayAgo } },
      }),
      this.prisma.matchSpamSignal.findMany({
        where: { suspicionScore: { gte: 60 } },
        take: 5,
        orderBy: { suspicionScore: 'desc' },
        include: {
          profile: {
            select: { id: true, displayName: true, role: true, bannedAt: true },
          },
        },
      }),
      this.prisma.$queryRaw<Array<{ value: MatchMarketplace; count: bigint }>>`
        SELECT value, COUNT(*)::bigint as count
        FROM "MatchProfile", unnest(marketplaces) AS value
        GROUP BY value
        ORDER BY count DESC
      `,
      this.prisma.$queryRaw<Array<{ value: MatchWorkFormat; count: bigint }>>`
        SELECT value, COUNT(*)::bigint as count
        FROM "MatchProfile", unnest("workFormats") AS value
        GROUP BY value
        ORDER BY count DESC
      `,
    ]);

    const timeseries = await this.prisma.matchDailyAggregate.findMany({
      where: { day: { gte: startOfDay(monthAgo) } },
      orderBy: { day: 'asc' },
      select: { day: true, activeProfiles: true },
    });

    return {
      kpis: {
        dau,
        wau,
        mau,
        newProfiles7d,
        swipes24h,
        matches24h,
        redeems24h,
      },
      dauSeries: timeseries.map((item) => ({
        day: item.day.toISOString().slice(0, 10),
        value: item.activeProfiles,
      })),
      topSuspicious: topSpam.map((item) => ({
        profileId: item.profileId,
        displayName: item.profile.displayName,
        role: item.profile.role,
        suspicionScore: item.suspicionScore,
        bannedAt: item.profile.bannedAt,
      })),
      marketplaceDistribution: marketplaceDistribution.map((item) => ({
        marketplace: item.value,
        count: Number(item.count),
      })),
      workFormatDistribution: workFormatDistribution.map((item) => ({
        workFormat: item.value,
        count: Number(item.count),
      })),
    };
  }

  async timeseries(metric: string, period: number) {
    const allowed = new Set([
      'dau',
      'new_profiles',
      'swipes',
      'likes',
      'matches',
      'messages',
      'invites_redeemed',
    ]);
    if (!allowed.has(metric)) throw new BadRequestException('metric_invalid');
    const days = Math.min(Math.max(period || 30, 1), 180);
    const since = startOfDay(addDays(new Date(), -days));
    const rows = await this.prisma.matchDailyAggregate.findMany({
      where: { day: { gte: since } },
      orderBy: { day: 'asc' },
    });
    const keyByMetric: Record<string, keyof (typeof rows)[number]> = {
      dau: 'activeProfiles',
      new_profiles: 'newProfiles',
      swipes: 'swipes',
      likes: 'likes',
      matches: 'matches',
      messages: 'messages',
      invites_redeemed: 'invitesRedeemed',
    };
    const key = keyByMetric[metric];
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      value: Number(row[key] ?? 0),
    }));
  }

  /**
   * Временной ряд для дашборда: регистрации (новые профили), свайпы, матчи.
   * `day` — агрегаты MatchDailyAggregate; `hour` — сырые события с дискретностью 1ч (лимит периода).
   */
  async metricsSeries(granularity: 'day' | 'hour', period: number) {
    if (granularity === 'day') {
      const days = Math.min(Math.max(period || 30, 1), 180);
      const rangeEnd = startOfDay(new Date());
      const rangeStart = startOfDay(addDays(rangeEnd, -(days - 1)));
      const rows = await this.prisma.matchDailyAggregate.findMany({
        where: { day: { gte: rangeStart, lte: rangeEnd } },
        orderBy: { day: 'asc' },
        select: {
          day: true,
          newProfiles: true,
          swipes: true,
          matches: true,
        },
      });
      const byDay = new Map(
        rows.map((r) => {
          const key = r.day.toISOString().slice(0, 10);
          return [
            key,
            {
              t: key,
              registrations: r.newProfiles,
              swipes: r.swipes,
              matches: r.matches,
            },
          ] as const;
        }),
      );
      const points: Array<{
        t: string;
        registrations: number;
        swipes: number;
        matches: number;
      }> = [];
      for (
        let t = rangeStart.getTime();
        t <= rangeEnd.getTime();
        t += 86400_000
      ) {
        const key = new Date(t).toISOString().slice(0, 10);
        points.push(
          byDay.get(key) ?? {
            t: key,
            registrations: 0,
            swipes: 0,
            matches: 0,
          },
        );
      }
      return { granularity: 'day' as const, periodDays: days, points };
    }

    const maxDays = 14;
    const days = Math.min(Math.max(period || 7, 1), maxDays);
    const end = alignToHourStartUtc(new Date());
    const since = addHours(end, -days * 24);

    type Row = { bucket: Date; c: bigint };
    const [regs, swp, mtc] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(
        Prisma.sql`SELECT date_trunc('hour', "createdAt") AS bucket, COUNT(*)::bigint AS c
        FROM "MatchProfile"
        WHERE "createdAt" >= ${since} AND "createdAt" < ${end}
        GROUP BY 1
        ORDER BY 1`,
      ),
      this.prisma.$queryRaw<Row[]>(
        Prisma.sql`SELECT date_trunc('hour', "createdAt") AS bucket, COUNT(*)::bigint AS c
        FROM "MatchSwipe"
        WHERE "createdAt" >= ${since} AND "createdAt" < ${end}
        GROUP BY 1
        ORDER BY 1`,
      ),
      this.prisma.$queryRaw<Row[]>(
        Prisma.sql`SELECT date_trunc('hour', "createdAt") AS bucket, COUNT(*)::bigint AS c
        FROM "MatchPair"
        WHERE "createdAt" >= ${since} AND "createdAt" < ${end}
        GROUP BY 1
        ORDER BY 1`,
      ),
    ]);
    const regMap = new Map(
      regs.map((r) => [r.bucket.getTime(), Number(r.c)] as const),
    );
    const swpMap = new Map(
      swp.map((r) => [r.bucket.getTime(), Number(r.c)] as const),
    );
    const mtcMap = new Map(
      mtc.map((r) => [r.bucket.getTime(), Number(r.c)] as const),
    );
    const points: Array<{
      t: string;
      registrations: number;
      swipes: number;
      matches: number;
    }> = [];
    for (let t = since.getTime(); t < end.getTime(); t += 3600_000) {
      points.push({
        t: new Date(t).toISOString(),
        registrations: regMap.get(t) ?? 0,
        swipes: swpMap.get(t) ?? 0,
        matches: mtcMap.get(t) ?? 0,
      });
    }
    return { granularity: 'hour' as const, periodDays: days, points };
  }

  async roleDistribution() {
    const rows = await this.prisma.matchProfile.groupBy({
      by: ['role'],
      _count: { _all: true },
    });
    return rows.map((item) => ({ role: item.role, count: item._count._all }));
  }

  async users(params: {
    query?: string;
    role?: string;
    workFormat?: string;
    marketplace?: string;
    banned?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);
    const where: Prisma.MatchProfileWhereInput = {};

    // Валидация enum-фильтров по белому списку Prisma-enum'ов.
    // Невалидное значение (опечатка админа, устаревший кеш UI) —
    // игнорируем фильтр, а не падаем с 500. Логируем, чтобы было видно
    // в Sentry/логах API.
    const role = coerceEnum(params.role, MatchRole);
    if (params.role && !role) {
      this.logger.warn(
        `admin users filter: invalid role "${params.role}" — ignored`,
      );
    }
    if (role) where.role = role;

    const workFormat = coerceEnum(params.workFormat, MatchWorkFormat);
    if (params.workFormat && !workFormat) {
      this.logger.warn(
        `admin users filter: invalid workFormat "${params.workFormat}" — ignored`,
      );
    }
    if (workFormat) where.workFormats = { has: workFormat };

    const marketplace = coerceEnum(params.marketplace, MatchMarketplace);
    if (params.marketplace && !marketplace) {
      this.logger.warn(
        `admin users filter: invalid marketplace "${params.marketplace}" — ignored`,
      );
    }
    if (marketplace) where.marketplaces = { has: marketplace };
    if (params.banned === '1') where.bannedAt = { not: null };
    if (params.banned === '0') where.bannedAt = null;
    if (params.query) {
      const q = params.query.trim();
      where.OR = [
        { displayName: { contains: q, mode: 'insensitive' } },
        { user: { telegramId: { contains: q } } },
        { user: { telegramUsername: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.matchProfile.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { telegramId: true, telegramUsername: true } },
          spamSignal: true,
          invitesIssued: {
            where: { usedAt: null, revokedAt: null },
            select: { id: true },
          },
          invitedBy: {
            include: {
              owner: { select: { id: true, displayName: true } },
            },
          },
          _count: {
            select: {
              swipesFrom: true,
              swipesTo: true,
              invitesIssued: true,
            },
          },
        },
      }),
      this.prisma.matchProfile.count({ where }),
    ]);

    const profileIds = items.map((item) => item.id);
    const [
      likesByProfile,
      passesByProfile,
      superByProfile,
      usedInvitesByProfile,
      matchPairs,
    ] = await Promise.all([
      this.prisma.matchSwipe.groupBy({
        by: ['fromProfileId'],
        where: { fromProfileId: { in: profileIds }, direction: 'LIKE' },
        _count: { _all: true },
      }),
      this.prisma.matchSwipe.groupBy({
        by: ['fromProfileId'],
        where: { fromProfileId: { in: profileIds }, direction: 'PASS' },
        _count: { _all: true },
      }),
      this.prisma.matchSwipe.groupBy({
        by: ['fromProfileId'],
        where: { fromProfileId: { in: profileIds }, isSuperLike: true },
        _count: { _all: true },
      }),
      this.prisma.matchInviteCode.groupBy({
        by: ['ownerProfileId'],
        where: { ownerProfileId: { in: profileIds }, usedAt: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.matchPair.findMany({
        where: {
          OR: [
            { profileAId: { in: profileIds } },
            { profileBId: { in: profileIds } },
          ],
        },
        select: { profileAId: true, profileBId: true },
      }),
    ]);

    const likesMap = new Map(
      likesByProfile.map((x) => [x.fromProfileId, x._count._all]),
    );
    const passesMap = new Map(
      passesByProfile.map((x) => [x.fromProfileId, x._count._all]),
    );
    const superMap = new Map(
      superByProfile.map((x) => [x.fromProfileId, x._count._all]),
    );
    const matchesMap = new Map<string, number>();
    for (const pair of matchPairs) {
      if (profileIds.includes(pair.profileAId)) {
        matchesMap.set(
          pair.profileAId,
          (matchesMap.get(pair.profileAId) ?? 0) + 1,
        );
      }
      if (profileIds.includes(pair.profileBId)) {
        matchesMap.set(
          pair.profileBId,
          (matchesMap.get(pair.profileBId) ?? 0) + 1,
        );
      }
    }
    const usedInvitesMap = new Map(
      usedInvitesByProfile.map((x) => [x.ownerProfileId ?? '', x._count._all]),
    );

    return {
      total,
      items: items.map((item) => {
        const likes = likesMap.get(item.id) ?? 0;
        const passes = passesMap.get(item.id) ?? 0;
        const superLikes = superMap.get(item.id) ?? 0;
        const swipes = likes + passes;
        return {
          profileId: item.id,
          displayName: item.displayName,
          role: item.role,
          city: item.city,
          workFormats: item.workFormats,
          marketplaces: item.marketplaces,
          marketplacesCustom: item.marketplacesCustom,
          createdAt: item.createdAt,
          lastActiveAt: item.lastActiveAt,
          swipes: {
            total: swipes,
            likes,
            passes,
            superLikes,
            likeRate: swipes > 0 ? likes / swipes : 0,
          },
          matches: {
            total: matchesMap.get(item.id) ?? 0,
          },
          invites: {
            available: item.invitesIssued.length,
            issued: item._count.invitesIssued,
            activated: usedInvitesMap.get(item.id) ?? 0,
          },
          invitedBy: item.invitedBy?.owner
            ? {
                profileId: item.invitedBy.owner.id,
                displayName: item.invitedBy.owner.displayName,
              }
            : null,
          suspicionScore: item.spamSignal?.suspicionScore ?? 0,
          bannedAt: item.bannedAt,
          shadowBanned: item.shadowBanned,
          telegramId: item.user.telegramId,
          telegramUsername: item.user.telegramUsername,
        };
      }),
    };
  }

  async userDetails(profileId: string) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { id: profileId },
      include: {
        user: true,
        settings: true,
        spamSignal: true,
        invitesIssued: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            usedBy: { select: { id: true, displayName: true, role: true } },
          },
        },
        invitedBy: {
          include: {
            owner: { select: { id: true, displayName: true, role: true } },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const [swipes, matches, events] = await Promise.all([
      this.prisma.matchSwipe.findMany({
        where: { fromProfileId: profileId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.matchPair.findMany({
        where: { OR: [{ profileAId: profileId }, { profileBId: profileId }] },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.matchEventLog.findMany({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

    // BigInt (id) не сериализуется в JSON — без этого Nest отдаёт 500.
    const eventsJsonSafe = events.map((e) => ({
      ...e,
      id: e.id.toString(),
    }));

    return { profile, swipes, matches, events: eventsJsonSafe };
  }

  async userEvents(profileId: string, limit = 100, beforeId?: string) {
    const take = Math.min(Math.max(limit, 1), 500);
    const where: Prisma.MatchEventLogWhereInput = { profileId };
    if (beforeId) where.id = { lt: BigInt(beforeId) };
    const rows = await this.prisma.matchEventLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take,
    });
    return rows.map((e) => ({ ...e, id: e.id.toString() }));
  }

  async spamFlagged(minScore = 60) {
    return this.prisma.matchSpamSignal.findMany({
      where: { suspicionScore: { gte: minScore } },
      orderBy: { suspicionScore: 'desc' },
      include: {
        profile: {
          select: {
            id: true,
            displayName: true,
            role: true,
            bannedAt: true,
            shadowBanned: true,
            createdAt: true,
            lastActiveAt: true,
          },
        },
      },
      take: 200,
    });
  }

  private scoreSignal(input: {
    likeRateRecent: number | null;
    totalSwipes: number;
    totalMatches: number;
    swipesPerMinutePeak: number;
    duplicateFirstMsgCount: number;
    invitedBurstFlag: boolean;
    createdAt: Date;
    lastActiveAt: Date;
  }) {
    let score = 0;
    if (input.likeRateRecent != null) {
      if (input.likeRateRecent > 0.95) score += 25;
      else if (input.likeRateRecent < 0.05 && input.totalSwipes > 50)
        score += 10;
    }
    if (input.swipesPerMinutePeak > 15) score += 20;
    else if (input.swipesPerMinutePeak > 8) score += 10;
    if (input.totalSwipes > 100 && input.totalMatches === 0) score += 25;
    if (input.duplicateFirstMsgCount >= 3) score += 15;
    if (input.invitedBurstFlag) score += 15;
    if (
      input.createdAt > addDays(new Date(), -7) &&
      input.lastActiveAt.getTime() - input.createdAt.getTime() <
        10 * 60 * 1000 &&
      input.totalSwipes < 5
    ) {
      score += 10;
    }
    return Math.min(score, 100);
  }

  async recomputeSpam(profileId?: string) {
    const profiles = await this.prisma.matchProfile.findMany({
      where: profileId ? { id: profileId } : { isActive: true },
      select: {
        id: true,
        createdAt: true,
        lastActiveAt: true,
      },
      take: profileId ? 1 : 5000,
    });

    for (const profile of profiles) {
      const [swipes, likes, matches, duplicateFirstMsgCount, burstFlag] =
        await Promise.all([
          this.prisma.matchSwipe.count({
            where: { fromProfileId: profile.id },
          }),
          this.prisma.matchSwipe.count({
            where: { fromProfileId: profile.id, direction: 'LIKE' },
          }),
          this.prisma.matchPair.count({
            where: {
              OR: [{ profileAId: profile.id }, { profileBId: profile.id }],
            },
          }),
          this.prisma.$queryRaw<{ count: bigint }[]>`
          select count(*)::bigint as count from (
            select body from "MatchMessage"
            where "senderProfileId" = ${profile.id}
            group by body
            having count(*) >= 2
          ) t
        `,
          this.prisma.matchSpamSignal.findUnique({
            where: { profileId: profile.id },
            select: { invitedBurstFlag: true },
          }),
        ]);

      const byMinute = await this.prisma.$queryRaw<
        { minute: Date; c: bigint }[]
      >`
        select date_trunc('minute', "createdAt") as minute, count(*)::bigint as c
        from "MatchSwipe"
        where "fromProfileId" = ${profile.id}
          and "createdAt" >= now() - interval '1 day'
        group by minute
        order by c desc
        limit 1
      `;
      const swipesPerMinutePeak = byMinute[0] ? Number(byMinute[0].c) : 0;
      const likeRateRecent = swipes > 0 ? likes / swipes : null;
      const zeroMatchRatio = swipes > 100 && matches === 0 ? 1 : 0;
      const score = this.scoreSignal({
        likeRateRecent,
        totalSwipes: swipes,
        totalMatches: matches,
        swipesPerMinutePeak,
        duplicateFirstMsgCount: Number(duplicateFirstMsgCount[0]?.count ?? 0),
        invitedBurstFlag: burstFlag?.invitedBurstFlag ?? false,
        createdAt: profile.createdAt,
        lastActiveAt: profile.lastActiveAt,
      });

      await this.prisma.matchSpamSignal.upsert({
        where: { profileId: profile.id },
        create: {
          profileId: profile.id,
          likeRateRecent,
          swipesPerMinutePeak,
          zeroMatchRatio,
          duplicateFirstMsgCount: Number(duplicateFirstMsgCount[0]?.count ?? 0),
          invitedBurstFlag: burstFlag?.invitedBurstFlag ?? false,
          suspicionScore: score,
          scoredAt: new Date(),
        },
        update: {
          likeRateRecent,
          swipesPerMinutePeak,
          zeroMatchRatio,
          duplicateFirstMsgCount: Number(duplicateFirstMsgCount[0]?.count ?? 0),
          suspicionScore: score,
          scoredAt: new Date(),
        },
      });
    }

    return { ok: true, processed: profiles.length };
  }

  async spamSignals(profileId: string): Promise<MatchSpamSignal | null> {
    return this.prisma.matchSpamSignal.findUnique({ where: { profileId } });
  }

  async banProfile(
    adminUserId: string,
    profileId: string,
    reason: string,
    shadow = false,
  ) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    await this.prisma.matchProfile.update({
      where: { id: profileId },
      data: {
        bannedAt: shadow ? null : new Date(),
        banReason: reason,
        shadowBanned: shadow,
      },
    });
    await this.writeAudit({
      adminUserId,
      action: shadow ? 'shadow_ban' : 'ban',
      targetProfileId: profileId,
      reason,
      payload: { shadow },
    });
    void this.eventLogger.log({
      profileId,
      type: 'BANNED',
      payload: { shadow, reason },
    });
    return { ok: true };
  }

  async unbanProfile(adminUserId: string, profileId: string, reason: string) {
    await this.prisma.matchProfile.update({
      where: { id: profileId },
      data: { bannedAt: null, banReason: null, shadowBanned: false },
    });
    await this.writeAudit({
      adminUserId,
      action: 'unban',
      targetProfileId: profileId,
      reason,
    });
    void this.eventLogger.log({
      profileId,
      type: 'UNBANNED',
      payload: { reason },
    });
    return { ok: true };
  }

  async cascadeBanPreview(profileId: string) {
    const ids = await this.subtreeProfileIds(profileId, 10);
    const alreadyBanned = await this.prisma.matchProfile.count({
      where: { id: { in: ids }, bannedAt: { not: null } },
    });
    return {
      targetCount: ids.length,
      alreadyBanned,
      confirmToken: this.signConfirmToken({
        action: 'cascade_ban',
        rootProfileId: profileId,
        ids,
      }),
    };
  }

  async cascadeBan(
    adminUserId: string,
    profileId: string,
    confirmToken: string,
    reason: string,
  ) {
    const payload = this.verifyConfirmToken(confirmToken);
    if (
      payload.action !== 'cascade_ban' ||
      payload.rootProfileId !== profileId
    ) {
      throw new BadRequestException('confirm_token_invalid');
    }
    const ids = Array.isArray(payload.ids) ? (payload.ids as string[]) : [];
    await this.prisma.matchProfile.updateMany({
      where: { id: { in: ids } },
      data: { bannedAt: new Date(), banReason: reason, shadowBanned: false },
    });
    await this.writeAudit({
      adminUserId,
      action: 'cascade_ban',
      targetProfileId: profileId,
      reason,
      payload: { count: ids.length },
    });
    return { ok: true, affected: ids.length };
  }

  async cascadeRevokePreview(profileId: string) {
    const ids = await this.subtreeProfileIds(profileId, 10);
    const revokable = await this.prisma.matchInviteCode.count({
      where: {
        ownerProfileId: { in: ids },
        usedAt: null,
        revokedAt: null,
      },
    });
    return {
      targetProfiles: ids.length,
      revokableCodes: revokable,
      confirmToken: this.signConfirmToken({
        action: 'cascade_revoke',
        rootProfileId: profileId,
        ids,
      }),
    };
  }

  async cascadeRevoke(
    adminUserId: string,
    profileId: string,
    confirmToken: string,
    reason: string,
  ) {
    const payload = this.verifyConfirmToken(confirmToken);
    if (
      payload.action !== 'cascade_revoke' ||
      payload.rootProfileId !== profileId
    ) {
      throw new BadRequestException('confirm_token_invalid');
    }
    const ids = Array.isArray(payload.ids) ? (payload.ids as string[]) : [];
    const result = await this.prisma.matchInviteCode.updateMany({
      where: {
        ownerProfileId: { in: ids },
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    await this.writeAudit({
      adminUserId,
      action: 'cascade_revoke',
      targetProfileId: profileId,
      reason,
      payload: { revoked: result.count, profileCount: ids.length },
    });
    return { ok: true, revoked: result.count };
  }

  async issueToSelf(adminUserId: string, count: number) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { userId: adminUserId },
      select: { id: true },
    });
    if (!profile) throw new BadRequestException('admin_profile_required');
    const issued = await this.inviteService.issueForProfile(
      profile.id,
      count,
      'admin',
    );
    await this.writeAudit({
      adminUserId,
      action: 'issue_to_self',
      targetProfileId: profile.id,
      payload: { count, issued: issued.length },
    });
    return issued;
  }

  async issueToProfile(
    adminUserId: string,
    profileId: string,
    count: number,
    reason: string,
  ) {
    const issued = await this.inviteService.issueForProfile(
      profileId,
      count,
      'admin',
    );
    await this.writeAudit({
      adminUserId,
      action: 'issue_to_profile',
      targetProfileId: profileId,
      reason,
      payload: { count, issued: issued.length },
    });
    return issued;
  }

  async issueDetached(
    adminUserId: string,
    count: number,
    reason: string,
    label?: string,
  ) {
    const issued = await this.inviteService.issueAdminFree(count, null);
    await this.writeAudit({
      adminUserId,
      action: 'issue_detached',
      reason,
      payload: { count, issued: issued.length, label: label ?? null },
    });
    return issued;
  }

  async issueToAdmins(adminUserId: string, count: number, reason: string) {
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const users = await this.prisma.user.findMany({
      select: { id: true, telegramId: true },
    });
    const adminUsers = users.filter((user) =>
      adminEmails.includes(
        toAdminEmailByTelegramId(user.telegramId).toLowerCase(),
      ),
    );
    const profiles = await this.prisma.matchProfile.findMany({
      where: { userId: { in: adminUsers.map((u) => u.id) } },
      select: { id: true },
    });
    let totalIssued = 0;
    for (const profile of profiles) {
      const rows = await this.inviteService.issueForProfile(
        profile.id,
        count,
        'admin',
      );
      totalIssued += rows.length;
    }
    await this.writeAudit({
      adminUserId,
      action: 'issue_to_admins',
      reason,
      payload: { count, admins: profiles.length, totalIssued },
    });
    return { admins: profiles.length, totalIssued };
  }

  async bulkGift(
    adminUserId: string,
    profileIds: string[],
    countEach: number,
    reason: string,
  ) {
    const uniqueIds = Array.from(new Set(profileIds));
    const results: Array<{ profileId: string; issued: number }> = [];
    for (const profileId of uniqueIds) {
      const rows = await this.inviteService.issueForProfile(
        profileId,
        countEach,
        'admin',
      );
      results.push({ profileId, issued: rows.length });
    }
    await this.writeAudit({
      adminUserId,
      action: 'bulk_gift',
      reason,
      payload: { profileCount: uniqueIds.length, countEach },
    });
    return results;
  }

  async invites(params: {
    status?: string;
    owner?: string;
    usedBy?: string;
    source?: string;
    limit?: number;
  }) {
    const where: Prisma.MatchInviteCodeWhereInput = {};
    if (params.status === 'available') {
      where.usedAt = null;
      where.revokedAt = null;
    } else if (params.status === 'used') {
      where.usedAt = { not: null };
    } else if (params.status === 'revoked') {
      where.revokedAt = { not: null };
    }
    if (params.source) where.source = params.source;
    if (params.owner) {
      where.owner = {
        displayName: { contains: params.owner, mode: 'insensitive' },
      };
    }
    if (params.usedBy) {
      where.usedBy = {
        displayName: { contains: params.usedBy, mode: 'insensitive' },
      };
    }

    return this.prisma.matchInviteCode.findMany({
      where,
      select: {
        id: true,
        code: true,
        createdAt: true,
        source: true,
        usedAt: true,
        usedByProfileId: true,
        revokedAt: true,
        ownerProfileId: true,
        owner: { select: { id: true, displayName: true, role: true } },
        usedBy: { select: { id: true, displayName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(params.limit ?? 200, 1), 1000),
    });
  }

  async revokeInvite(adminUserId: string, code: string, reason: string) {
    const row = await this.prisma.matchInviteCode.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Invite not found');
    await this.inviteService.revokeById(row.id);
    await this.writeAudit({
      adminUserId,
      action: 'revoke_invite',
      reason,
      payload: { code },
    });
    return { ok: true };
  }

  async inviteTree(rootProfileId: string, depth = 3) {
    const maxDepth = Math.min(Math.max(depth, 1), 6);
    const nodes = new Map<
      string,
      {
        profileId: string;
        displayName: string;
        role: string;
        createdAt: Date;
        suspicionScore: number;
        isBanned: boolean;
        isShadowBanned: boolean;
        stats: {
          swipes: number;
          likes: number;
          matches: number;
          invitesActivated: number;
        };
        children: string[];
      }
    >();

    let current = [rootProfileId];
    for (let d = 0; d <= maxDepth; d += 1) {
      if (!current.length) break;
      const profiles = await this.prisma.matchProfile.findMany({
        where: { id: { in: current } },
        include: { spamSignal: true },
      });
      const profileIds = profiles.map((p) => p.id);
      const [
        childrenRows,
        swipesCounts,
        likesCounts,
        usedInvitesCounts,
        matchPairs,
      ] = await Promise.all([
        this.prisma.matchInviteCode.findMany({
          where: {
            ownerProfileId: { in: profileIds },
            usedByProfileId: { not: null },
          },
          select: { ownerProfileId: true, usedByProfileId: true },
        }),
        this.prisma.matchSwipe.groupBy({
          by: ['fromProfileId'],
          where: { fromProfileId: { in: profileIds } },
          _count: { _all: true },
        }),
        this.prisma.matchSwipe.groupBy({
          by: ['fromProfileId'],
          where: { fromProfileId: { in: profileIds }, direction: 'LIKE' },
          _count: { _all: true },
        }),
        this.prisma.matchInviteCode.groupBy({
          by: ['ownerProfileId'],
          where: { ownerProfileId: { in: profileIds }, usedAt: { not: null } },
          _count: { _all: true },
        }),
        this.prisma.matchPair.findMany({
          where: {
            OR: [
              { profileAId: { in: profileIds } },
              { profileBId: { in: profileIds } },
            ],
          },
          select: { profileAId: true, profileBId: true },
        }),
      ]);
      const childrenByOwner = new Map<string, string[]>();
      for (const row of childrenRows) {
        if (!row.ownerProfileId || !row.usedByProfileId) continue;
        childrenByOwner.set(row.ownerProfileId, [
          ...(childrenByOwner.get(row.ownerProfileId) ?? []),
          row.usedByProfileId,
        ]);
      }
      const swMap = new Map(
        swipesCounts.map((x) => [x.fromProfileId, x._count._all]),
      );
      const liMap = new Map(
        likesCounts.map((x) => [x.fromProfileId, x._count._all]),
      );
      const usMap = new Map(
        usedInvitesCounts.map((x) => [x.ownerProfileId ?? '', x._count._all]),
      );
      const maMap = new Map<string, number>();
      for (const pair of matchPairs) {
        if (profileIds.includes(pair.profileAId)) {
          maMap.set(pair.profileAId, (maMap.get(pair.profileAId) ?? 0) + 1);
        }
        if (profileIds.includes(pair.profileBId)) {
          maMap.set(pair.profileBId, (maMap.get(pair.profileBId) ?? 0) + 1);
        }
      }

      for (const profile of profiles) {
        nodes.set(profile.id, {
          profileId: profile.id,
          displayName: profile.displayName,
          role: profile.role,
          createdAt: profile.createdAt,
          suspicionScore: profile.spamSignal?.suspicionScore ?? 0,
          isBanned: !!profile.bannedAt,
          isShadowBanned: profile.shadowBanned,
          stats: {
            swipes: swMap.get(profile.id) ?? 0,
            likes: liMap.get(profile.id) ?? 0,
            matches: maMap.get(profile.id) ?? 0,
            invitesActivated: usMap.get(profile.id) ?? 0,
          },
          children: childrenByOwner.get(profile.id) ?? [],
        });
      }
      current = Array.from(
        new Set(
          childrenRows
            .map((row) => row.usedByProfileId)
            .filter(Boolean) as string[],
        ),
      );
    }

    const buildNode = (
      id: string,
      level: number,
    ): Record<string, unknown> | null => {
      const node = nodes.get(id);
      if (!node) return null;
      const children =
        level >= maxDepth
          ? []
          : (node.children
              .map((childId) => buildNode(childId, level + 1))
              .filter(Boolean) as Record<string, unknown>[]);
      const subtreeSuspicion =
        node.suspicionScore +
        children.reduce(
          (sum, item) => sum + Number(item.subtreeSuspicion ?? 0),
          0,
        );
      const totalSubtreeSize =
        1 +
        children.reduce(
          (sum, item) => sum + Number(item.totalSubtreeSize ?? 0),
          0,
        );
      return {
        profileId: node.profileId,
        displayName: node.displayName,
        role: node.role,
        createdAt: node.createdAt.toISOString(),
        suspicionScore: node.suspicionScore,
        isBanned: node.isBanned,
        isShadowBanned: node.isShadowBanned,
        stats: node.stats,
        burstFlag: false,
        totalSubtreeSize,
        subtreeSuspicion,
        children,
      };
    };

    return buildNode(rootProfileId, 0);
  }

  async inviteRoots(limit = 50) {
    const roots = await this.prisma.matchProfile.findMany({
      where: { invitedBy: null },
      take: Math.min(Math.max(limit, 1), 200),
      orderBy: { createdAt: 'desc' },
      select: { id: true, displayName: true, role: true, createdAt: true },
    });
    const result = [];
    for (const root of roots) {
      const tree = (await this.inviteTree(root.id, 2)) as {
        subtreeSuspicion?: number;
        totalSubtreeSize?: number;
      } | null;
      result.push({
        ...root,
        subtreeSuspicion: tree?.subtreeSuspicion ?? 0,
        totalSubtreeSize: tree?.totalSubtreeSize ?? 1,
      });
    }
    return result
      .sort((a, b) => b.subtreeSuspicion - a.subtreeSuspicion)
      .slice(0, limit);
  }

  async ancestors(profileId: string) {
    const chain: Array<{
      profileId: string;
      displayName: string;
      role: string;
    }> = [];
    let currentId: string | null = profileId;
    for (let i = 0; i < 20 && currentId; i += 1) {
      const invite = (await this.prisma.matchInviteCode.findUnique({
        where: { usedByProfileId: currentId },
        select: { ownerProfileId: true },
      })) as { ownerProfileId: string | null } | null;
      if (!invite?.ownerProfileId) break;
      const owner = (await this.prisma.matchProfile.findUnique({
        where: { id: invite.ownerProfileId },
        select: { id: true, displayName: true, role: true },
      })) as { id: string; displayName: string; role: string } | null;
      if (!owner) break;
      chain.push({
        profileId: owner.id,
        displayName: owner.displayName,
        role: owner.role,
      });
      currentId = owner.id;
    }
    return chain;
  }

  async searchInviteTree(q: string) {
    const query = q.trim();
    if (!query) return [];
    const normalizedCode = normalizeInviteCode(query);
    return this.prisma.matchProfile.findMany({
      where: {
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          {
            invitesIssued: { some: { code: { equals: normalizedCode } } },
          },
        ],
      },
      select: { id: true, displayName: true, role: true, createdAt: true },
      take: 50,
    });
  }

  async audit(params: {
    admin?: string;
    action?: string;
    target?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Prisma.MatchAdminAuditWhereInput = {};
    if (params.admin) where.adminUserId = params.admin;
    if (params.action) where.action = params.action;
    if (params.target) where.targetProfileId = params.target;
    return this.prisma.matchAdminAudit.findMany({
      where,
      include: {
        adminUser: {
          select: { id: true, displayName: true, telegramId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(params.limit ?? 100, 1), 500),
      skip: Math.max(params.offset ?? 0, 0),
    });
  }

  async liveEvents(limit = 50) {
    return this.prisma.matchEventLog.findMany({
      orderBy: { id: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
