import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { DEFAULTS } from './match.constants';
import { EventLoggerService } from './event-logger.service';
import { InviteService } from './invite.service';
import {
  addDaysUtc,
  getNumberEnv,
  INVITE_CONFIG,
  isFeatureEnabled,
  isInviteOnlyModeEnabled,
  normalizeInviteCode,
  startOfMoscowDay,
  toAdminEmailByTelegramId,
  zodiacByBirthDate,
} from './match.utils';

function uniqTrimmed(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = raw.trim().toLocaleLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inviteService: InviteService,
    private readonly eventLogger: EventLoggerService,
  ) {}

  // Fail-safe: invite-only ON, если переменная не задана. См. match.utils.
  private isInviteOnlyEnabled(): boolean {
    return isInviteOnlyModeEnabled();
  }

  private isAdminTelegramId(telegramId?: string | null): boolean {
    if (!telegramId) return false;
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return adminEmails.includes(
      toAdminEmailByTelegramId(telegramId).toLowerCase(),
    );
  }

  private isInviteBypassUsername(telegramUsername?: string | null): boolean {
    if (!telegramUsername) return false;
    const bypass = (process.env.MATCH_INVITE_BYPASS_USERNAMES ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return bypass.includes(telegramUsername.trim().toLowerCase());
  }

  async getMe(userId: string) {
    const [profile, user] = await Promise.all([
      this.prisma.matchProfile.findUnique({
        where: { userId },
        include: {
          settings: true,
          photos: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true },
      }),
    ]);
    const isAdmin = this.isAdminTelegramId(user?.telegramId);
    const featureInviteOnly = this.isInviteOnlyEnabled();
    const autoResetEnabled = isFeatureEnabled(
      process.env.MATCH_AUTO_SWIPE_RESET,
      false,
    );
    const likeLimitPerDay = getNumberEnv(
      process.env.MATCH_LIKE_LIMIT_PER_DAY,
      DEFAULTS.MATCH_LIKE_LIMIT_PER_DAY,
    );

    if (!profile) {
      return {
        profile: null,
        settings: null,
        streak: { current: 0, nextRewardAt: 7 },
        superLikeBalance: 0,
        pendingLikeCount: 0,
        likeCountToday: 0,
        likeLimitPerDay,
        invites: {
          available: 0,
          issued: 0,
          activated: 0,
          nextGrantAt: null,
        },
        isAdmin,
        featureInviteOnly,
        autoResetEnabled,
        lastResetTriggeredBy: null,
        lastResetDeletedCount: 0,
        activity: null,
      };
    }

    const now = new Date();
    const since7d = addDaysUtc(now, -7);
    const startToday = startOfMoscowDay(now);
    const [pendingLikeCount, likeCountToday, inviteStats, lastResetEvent] =
      await Promise.all([
        this.prisma.matchSwipe.count({
          where: {
            toProfileId: profile.id,
            direction: 'LIKE',
            createdAt: { gte: since7d },
            NOT: {
              fromProfile: {
                swipesFrom: {
                  some: {
                    toProfileId: profile.id,
                    direction: 'LIKE',
                  },
                },
              },
            },
          },
        }),
        this.prisma.matchSwipe.count({
          where: {
            fromProfileId: profile.id,
            direction: 'LIKE',
            isSuperLike: false,
            createdAt: { gte: startToday },
          },
        }),
        this.inviteService.statsForProfile(profile.id),
        this.prisma.matchEventLog.findFirst({
          where: { profileId: profile.id, type: 'SWIPE_RESET' },
          orderBy: { createdAt: 'desc' },
          select: { payload: true },
        }),
      ]);

    const streakCurrent = profile.swipeStreakDays ?? 0;
    const mod = streakCurrent % 7;
    const nextRewardAt = mod === 0 ? 7 : 7 - mod;

    // Private activity snapshot — returned ONLY to the profile owner.
    // The quadrant raw enum is intentionally included (owner can see
    // their own classification), but feed.service strips it from rows
    // about other people. Gated on MATCH_FEATURE_RECIPROCITY so we can
    // ship the shadow-write phase before the UI section.
    const reciprocityEnabled = isFeatureEnabled(
      process.env.MATCH_FEATURE_RECIPROCITY,
      false,
    );
    // Lagging-indicator guard (see plan §9.1): don't show a quadrant on
    // accounts younger than 7 days or with fewer than 3 sent likes —
    // otherwise every newcomer sees SLEEPING and interprets it as a
    // verdict. Below the guard we return activity=null so the UI shows
    // the welcome variant instead.
    const ACCOUNT_MIN_AGE_DAYS = 7;
    const SCORE_MIN_LIKES = 3;
    const accountAgeDays =
      (now.getTime() - profile.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const scoreReady =
      reciprocityEnabled &&
      accountAgeDays >= ACCOUNT_MIN_AGE_DAYS &&
      profile.likesSent14d >= SCORE_MIN_LIKES &&
      profile.scoreUpdatedAt != null;

    const activity = scoreReady
      ? {
          quadrant: profile.quadrant,
          likesSent14d: profile.likesSent14d,
          likesReceived14d: profile.likesReceived14d,
          matches14d: profile.matches14d,
          activityScore: profile.activityScore,
          reciprocityScore: profile.reciprocityScore,
          scoreUpdatedAt: profile.scoreUpdatedAt?.toISOString() ?? null,
          // Days since profile creation — rounded down, minimum 0. Used in
          // the "Ваша активность" UI to give context without raw dates.
          accountAgeDays: Math.max(0, Math.floor(accountAgeDays)),
        }
      : null;

    return {
      profile,
      settings: profile.settings ?? null,
      streak: { current: streakCurrent, nextRewardAt },
      superLikeBalance: profile.superLikeBalance ?? 0,
      pendingLikeCount,
      likeCountToday,
      likeLimitPerDay,
      invites: {
        available: inviteStats.invitesAvailable,
        issued: inviteStats.invitesIssued,
        activated: inviteStats.invitesActivated,
        nextGrantAt: inviteStats.nextGrantAt?.toISOString() ?? null,
      },
      isAdmin,
      featureInviteOnly,
      autoResetEnabled,
      lastResetTriggeredBy:
        ((lastResetEvent?.payload as { triggeredBy?: string } | null)
          ?.triggeredBy as 'manual' | 'auto' | 'auto_catchup' | undefined) ??
        null,
      lastResetDeletedCount:
        (lastResetEvent?.payload as { deletedCount?: number } | null)
          ?.deletedCount ?? 0,
      activity,
    };
  }

  async requireProfileById(profileId: string) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async requireProfileByUser(userId: string) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new ConflictException('profile_required');
    }
    return profile;
  }

  async upsertProfile(userId: string, dto: UpsertProfileDto) {
    const roleCustom = dto.role === 'CUSTOM' ? dto.roleCustom?.trim() : null;
    if (dto.role === 'CUSTOM' && !roleCustom) {
      throw new BadRequestException('roleCustom is required when role=CUSTOM');
    }
    if (
      typeof dto.priceMin === 'number' &&
      typeof dto.priceMax === 'number' &&
      dto.priceMin > dto.priceMax
    ) {
      throw new BadRequestException('priceMin cannot be greater than priceMax');
    }

    const parsedBirthDate = dto.birthDate
      ? new Date(`${dto.birthDate}T00:00:00.000Z`)
      : null;
    if (dto.birthDate && Number.isNaN(parsedBirthDate?.getTime())) {
      throw new BadRequestException('birthDate is invalid');
    }
    const zodiacSign = parsedBirthDate
      ? zodiacByBirthDate(parsedBirthDate)
      : null;

    const [existingProfile, user] = await Promise.all([
      this.prisma.matchProfile.findUnique({
        where: { userId },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { telegramId: true, telegramUsername: true },
      }),
    ]);

    const inviteOnlyEnabled = this.isInviteOnlyEnabled();
    const isAdminCreation =
      this.isAdminTelegramId(user?.telegramId) ||
      this.isInviteBypassUsername(user?.telegramUsername);
    // Флаг "требовать ли код для создания профиля" — настраивается env
    // и обходится админами/bypass-username'ами.
    const inviteRequired =
      inviteOnlyEnabled && !existingProfile && !isAdminCreation;
    const inviteCode = dto.inviteCode
      ? normalizeInviteCode(dto.inviteCode)
      : null;

    if (inviteRequired && !inviteCode) {
      throw new BadRequestException({ code: 'invite_required' });
    }

    // Код всегда расходуется при создании профиля, если передан.
    // Так инвайт не может быть использован повторно даже при выключенном
    // invite-only режиме. Для админов, которые заходят без кода, redeem
    // просто не вызывается.
    const shouldRedeemInvite = !existingProfile && Boolean(inviteCode);

    const profile = await this.prisma.$transaction(async (tx) => {
      const row = await tx.matchProfile.upsert({
        where: { userId },
        update: {
          role: dto.role,
          roleCustom,
          displayName: dto.displayName.trim(),
          headline: dto.headline?.trim() || null,
          bio: dto.bio?.trim() || null,
          experience: dto.experience ?? null,
          city: dto.city?.trim() || null,
          workFormats: dto.workFormats ? [...dto.workFormats] : undefined,
          marketplaces: dto.marketplaces ? [...dto.marketplaces] : undefined,
          marketplacesCustom:
            dto.marketplacesCustom !== undefined
              ? dto.marketplacesCustom.trim() || null
              : undefined,
          birthDate: dto.birthDate ? parsedBirthDate : undefined,
          zodiacSign: dto.birthDate ? zodiacSign : undefined,
          niches: uniqTrimmed(dto.niches),
          skills: uniqTrimmed(dto.skills),
          tools: dto.tools ? uniqTrimmed(dto.tools) : undefined,
          priceMin: dto.priceMin ?? null,
          priceMax: dto.priceMax ?? null,
          currency: dto.currency?.trim() || 'RUB',
          avatarUrl: dto.avatarUrl?.trim() || null,
          portfolioUrl: dto.portfolioUrl?.trim() || null,
          telegramContact: dto.telegramContact?.trim() || null,
          isActive: dto.isActive ?? true,
        },
        create: {
          userId,
          role: dto.role,
          roleCustom,
          displayName: dto.displayName.trim(),
          headline: dto.headline?.trim() || null,
          bio: dto.bio?.trim() || null,
          experience: dto.experience ?? null,
          city: dto.city?.trim() || null,
          workFormats: dto.workFormats ? [...dto.workFormats] : [],
          marketplaces: dto.marketplaces ? [...dto.marketplaces] : [],
          marketplacesCustom: dto.marketplacesCustom?.trim() || null,
          birthDate: parsedBirthDate,
          zodiacSign,
          niches: uniqTrimmed(dto.niches),
          skills: uniqTrimmed(dto.skills),
          tools: uniqTrimmed(dto.tools),
          priceMin: dto.priceMin ?? null,
          priceMax: dto.priceMax ?? null,
          currency: dto.currency?.trim() || 'RUB',
          avatarUrl: dto.avatarUrl?.trim() || null,
          portfolioUrl: dto.portfolioUrl?.trim() || null,
          telegramContact: dto.telegramContact?.trim() || null,
          isActive: dto.isActive ?? true,
          nextInviteGrantAt: addDaysUtc(
            new Date(),
            INVITE_CONFIG.PERIODIC_INTERVAL_DAYS,
          ),
        },
      });

      if (!existingProfile) {
        if (shouldRedeemInvite && inviteCode) {
          await this.inviteService.redeemForProfileCreation(
            tx,
            inviteCode,
            row.id,
          );
        }
        await this.inviteService.issueForProfile(
          row.id,
          INVITE_CONFIG.INITIAL_GRANT,
          'user',
          tx,
        );
        void this.eventLogger.log({
          profileId: row.id,
          userId,
          type: 'PROFILE_CREATED',
        });
      } else {
        void this.eventLogger.log({
          profileId: row.id,
          userId,
          type: 'PROFILE_UPDATED',
        });
      }

      return row;
    });

    await this.prisma.matchSettings.upsert({
      where: { profileId: profile.id },
      update: {
        interestedRoles: dto.interestedRoles
          ? [...dto.interestedRoles]
          : undefined,
        interestedWorkFormats: dto.interestedWorkFormats
          ? [...dto.interestedWorkFormats]
          : undefined,
        sameCityOnly: dto.sameCityOnly,
        interestedMarketplaces: dto.interestedMarketplaces
          ? [...dto.interestedMarketplaces]
          : undefined,
        interestedNiches: dto.interestedNiches
          ? uniqTrimmed(dto.interestedNiches)
          : undefined,
      },
      create: {
        profileId: profile.id,
        interestedRoles: dto.interestedRoles ? [...dto.interestedRoles] : [],
        interestedWorkFormats: dto.interestedWorkFormats
          ? [...dto.interestedWorkFormats]
          : [],
        sameCityOnly: dto.sameCityOnly ?? false,
        interestedMarketplaces: dto.interestedMarketplaces
          ? [...dto.interestedMarketplaces]
          : [],
        interestedNiches: dto.interestedNiches
          ? uniqTrimmed(dto.interestedNiches)
          : [],
        photoPreference: 'ANY',
        experienceMin: null,
        experienceMax: null,
      },
    });

    return this.getMe(userId);
  }

  async getSettings(profileId: string) {
    await this.requireProfileById(profileId);
    const settings = await this.prisma.matchSettings.findUnique({
      where: { profileId },
    });
    if (settings) return settings;

    return this.prisma.matchSettings.create({
      data: {
        profileId,
        interestedRoles: [],
        interestedWorkFormats: [],
        sameCityOnly: false,
        interestedMarketplaces: [],
        interestedNiches: [],
        photoPreference: 'ANY',
        experienceMin: null,
        experienceMax: null,
      },
    });
  }

  async updateSettings(profileId: string, dto: UpdateSettingsDto) {
    await this.requireProfileById(profileId);
    if (
      typeof dto.experienceMin === 'number' &&
      typeof dto.experienceMax === 'number' &&
      dto.experienceMin > dto.experienceMax
    ) {
      throw new BadRequestException('experience_range_invalid');
    }
    return this.prisma.matchSettings.upsert({
      where: { profileId },
      update: {
        interestedRoles: dto.interestedRoles
          ? [...dto.interestedRoles]
          : undefined,
        interestedWorkFormats: dto.interestedWorkFormats
          ? [...dto.interestedWorkFormats]
          : undefined,
        sameCityOnly: dto.sameCityOnly,
        interestedMarketplaces: dto.interestedMarketplaces
          ? [...dto.interestedMarketplaces]
          : undefined,
        interestedNiches: dto.interestedNiches
          ? uniqTrimmed(dto.interestedNiches)
          : undefined,
        experienceMin: dto.experienceMin ?? null,
        experienceMax: dto.experienceMax ?? null,
        photoPreference: dto.photoPreference,
        hideFromFeed: dto.hideFromFeed,
      },
      create: {
        profileId,
        interestedRoles: dto.interestedRoles ? [...dto.interestedRoles] : [],
        interestedWorkFormats: dto.interestedWorkFormats
          ? [...dto.interestedWorkFormats]
          : [],
        sameCityOnly: dto.sameCityOnly ?? false,
        interestedMarketplaces: dto.interestedMarketplaces
          ? [...dto.interestedMarketplaces]
          : [],
        interestedNiches: dto.interestedNiches
          ? uniqTrimmed(dto.interestedNiches)
          : [],
        experienceMin: dto.experienceMin ?? null,
        experienceMax: dto.experienceMax ?? null,
        photoPreference: dto.photoPreference ?? 'ANY',
        hideFromFeed: dto.hideFromFeed ?? false,
      },
    });
  }

  async setPause(profileId: string, days?: number) {
    const maxDays = getNumberEnv(
      process.env.MATCH_PAUSE_MAX_DAYS,
      DEFAULTS.MATCH_PAUSE_MAX_DAYS,
    );
    await this.requireProfileById(profileId);

    if (days == null) {
      const result = await this.prisma.matchProfile.update({
        where: { id: profileId },
        data: { pausedUntil: null },
        select: { id: true, pausedUntil: true },
      });
      void this.eventLogger.log({ profileId, type: 'PROFILE_UNPAUSED' });
      return result;
    }

    if (days <= 0 || days > maxDays) {
      throw new BadRequestException(`days must be in range 1..${maxDays}`);
    }

    const result = await this.prisma.matchProfile.update({
      where: { id: profileId },
      data: { pausedUntil: addDaysUtc(new Date(), days) },
      select: { id: true, pausedUntil: true },
    });
    void this.eventLogger.log({
      profileId,
      type: 'PROFILE_PAUSED',
      payload: { days },
    });
    return result;
  }
}
