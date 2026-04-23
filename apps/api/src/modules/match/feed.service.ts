import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type MatchActivityQuadrant,
  type MatchRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE_COMPLEMENT_MATRIX, RANKING_WEIGHTS } from './match.constants';
import { isFeatureEnabled, isMoscowRegion, normalizeCity } from './match.utils';
import { ProfileService } from './profile.service';

export type ActivityBadge = 'ACTIVE_TODAY' | 'WEEKLY_TOP';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const LOCAL_DEMO_TELEGRAM_PREFIX = 'match-dev-demo-%';
const LOCAL_DEV_TELEGRAM_ID = 'match-dev-local-telegram-id';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileService: ProfileService,
  ) {}

  async getFeed(profileId: string, rawLimit?: number, rawOffset?: number) {
    const me = await this.profileService.requireProfileById(profileId);
    const limit = Math.min(Math.max(rawLimit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offsetRawN = rawOffset == null ? 0 : Number(rawOffset);
    const offset =
      Number.isFinite(offsetRawN) && offsetRawN > 0
        ? Math.floor(offsetRawN)
        : 0;
    const settings = await this.prisma.matchSettings.findUnique({
      where: { profileId },
      select: {
        interestedRoles: true,
        interestedNiches: true,
        interestedWorkFormats: true,
        sameCityOnly: true,
        interestedMarketplaces: true,
        experienceMin: true,
        experienceMax: true,
        photoPreference: true,
      },
    });
    const roles = settings?.interestedRoles ?? [];
    const niches = settings?.interestedNiches ?? [];
    const interestedWorkFormats = settings?.interestedWorkFormats ?? [];
    const interestedMarketplaces = settings?.interestedMarketplaces ?? [];
    const sameCityOnly = settings?.sameCityOnly ?? false;
    const experienceMin = settings?.experienceMin ?? null;
    const experienceMax = settings?.experienceMax ?? null;
    const photoPreference = settings?.photoPreference ?? 'ANY';
    const complementRoles = roles.length
      ? roles
      : ROLE_COMPLEMENT_MATRIX[me.role];
    const rankingEnabled = isFeatureEnabled(
      process.env.MATCH_FEATURE_RANKING,
      true,
    );
    // Sub-flags for the activity × reciprocity rollout. Ranking and
    // badges ship separately so we can dial each up/down without a
    // deploy (see docs/CURSOR_TASKS_ACTIVITY_SCORE.md §7).
    const reciprocityRankingEnabled = isFeatureEnabled(
      process.env.MATCH_RECIPROCITY_RANKING,
      false,
    );
    const reciprocityBadgesEnabled = isFeatureEnabled(
      process.env.MATCH_RECIPROCITY_BADGES,
      false,
    );
    const myNiches = me.niches ?? [];
    const myWorkFormats = me.workFormats ?? [];
    const myMarketplaces = me.marketplaces ?? [];
    const myCity = normalizeCity(me.city);
    const myCityIsMoscow = isMoscowRegion(me.city);

    type FeedRow = {
      id: string;
      role: MatchRole;
      roleCustom: string | null;
      displayName: string;
      headline: string | null;
      bio: string | null;
      experience: number | null;
      city: string | null;
      birthDate: Date | null;
      zodiacSign: string | null;
      workFormats: string[];
      marketplaces: string[];
      marketplacesCustom: string | null;
      niches: string[];
      skills: string[];
      tools: string[];
      priceMin: number | null;
      priceMax: number | null;
      currency: string;
      avatarUrl: string | null;
      photos?: Array<{ id: string; url: string; order: number }>;
      portfolioUrl: string | null;
      telegramContact: string | null;
      isActive: boolean;
      incomingSuperLike?: boolean;
      score?: number;
      // Scoring fields — present in the row but only surfaced to the
      // client through activityBadge below. Raw quadrant/score never
      // leak outward (public negative signals = bad UX, see plan §5).
      quadrant: MatchActivityQuadrant;
      activityScore: number;
      lastActiveAt: Date;
    };

    // When the reciprocity ranking sub-flag is off, collapse all
    // quadrant weights to 0. This keeps the SQL identical in shape so
    // we don't need two extra branches — Postgres just adds zeros.
    const qWeights = reciprocityRankingEnabled
      ? {
          SOUGHT_AFTER: RANKING_WEIGHTS.QUADRANT_SOUGHT_AFTER,
          SELECTIVE: RANKING_WEIGHTS.QUADRANT_SELECTIVE,
          OVER_LIKER: RANKING_WEIGHTS.QUADRANT_OVER_LIKER,
          SLEEPING: RANKING_WEIGHTS.QUADRANT_SLEEPING,
        }
      : { SOUGHT_AFTER: 0, SELECTIVE: 0, OVER_LIKER: 0, SLEEPING: 0 };

    const rows = await this.prisma.$queryRaw<FeedRow[]>(
      rankingEnabled
        ? Prisma.sql`
      SELECT
        p.id,
        p.role,
        p."roleCustom",
        p."displayName",
        p.headline,
        p.bio,
        p.experience,
        p.city,
        p."birthDate",
        p."zodiacSign",
        p."workFormats",
        p.marketplaces,
        p."marketplacesCustom",
        p.niches,
        p.skills,
        p.tools,
        p."priceMin",
        p."priceMax",
        p.currency,
        p."avatarUrl",
        p.quadrant,
        p."activityScore",
        p."lastActiveAt",
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object('id', ph.id, 'url', ph.url, 'order', ph."order")
              ORDER BY ph."order", ph."createdAt"
            )
            FROM "MatchProfilePhoto" ph
            WHERE ph."profileId" = p.id
          ),
          '[]'::jsonb
        ) AS photos,
        p."portfolioUrl",
        p."telegramContact",
        p."isActive",
        EXISTS (
          SELECT 1
          FROM "MatchSwipe" sw_in
          WHERE sw_in."fromProfileId" = p.id
            AND sw_in."toProfileId" = ${profileId}
            AND sw_in.direction = 'LIKE'
            AND sw_in."isSuperLike" = true
        ) AS "incomingSuperLike",
        (
          CASE WHEN p.role = ANY(${complementRoles}::"MatchRole"[]) THEN ${RANKING_WEIGHTS.ROLE_COMPLEMENT_BONUS} ELSE 0 END
          + LEAST(
              cardinality(
                ARRAY(
                  SELECT UNNEST(p.niches)
                  INTERSECT
                  SELECT UNNEST(${myNiches}::text[])
                )
              ),
              ${RANKING_WEIGHTS.NICHE_OVERLAP_CAP}
            ) * ${RANKING_WEIGHTS.NICHE_OVERLAP_POINT}
          + CASE
              WHEN p."lastActiveAt" > now() - interval '24 hours' THEN ${RANKING_WEIGHTS.RECENT_ACTIVE_24H}
              WHEN p."lastActiveAt" > now() - interval '7 days' THEN ${RANKING_WEIGHTS.RECENT_ACTIVE_7D}
              ELSE 0
            END
          + CASE WHEN EXISTS (
              SELECT 1
              FROM "MatchSwipe" sw_boost
              WHERE sw_boost."fromProfileId" = p.id
                AND sw_boost."toProfileId" = ${profileId}
                AND sw_boost.direction = 'LIKE'
                AND sw_boost."isSuperLike" = true
            ) THEN ${RANKING_WEIGHTS.SUPER_LIKE_INCOMING} ELSE 0 END
          + CASE
              WHEN LOWER(COALESCE(p.city, '')) = ${myCity}::text THEN ${RANKING_WEIGHTS.CITY_MATCH_EXACT}
              WHEN ${myCityIsMoscow}::boolean = true
                AND LOWER(COALESCE(p.city, '')) IN ('москва','мск','moscow','санкт-петербург','спб','питер','saint petersburg')
                THEN ${RANKING_WEIGHTS.CITY_MATCH_REGION}
              ELSE 0
            END
          + LEAST(
              cardinality(ARRAY(
                SELECT UNNEST(p.marketplaces) INTERSECT SELECT UNNEST(${myMarketplaces}::"MatchMarketplace"[])
              )),
              ${RANKING_WEIGHTS.MARKETPLACE_OVERLAP_CAP}
            ) * ${RANKING_WEIGHTS.MARKETPLACE_OVERLAP_POINT}
          + CASE
              WHEN cardinality(${myWorkFormats}::"MatchWorkFormat"[]) > 0
                AND p."workFormats" && ${myWorkFormats}::"MatchWorkFormat"[]
                THEN ${RANKING_WEIGHTS.WORK_FORMAT_OVERLAP}
              ELSE 0
            END
          + CASE p.quadrant
              WHEN 'SOUGHT_AFTER' THEN ${qWeights.SOUGHT_AFTER}
              WHEN 'SELECTIVE'    THEN ${qWeights.SELECTIVE}
              WHEN 'OVER_LIKER'   THEN ${qWeights.OVER_LIKER}
              ELSE ${qWeights.SLEEPING}
            END
        ) * CASE
              WHEN p."likeRateRecent" > ${RANKING_WEIGHTS.SPAMMER_LIKE_RATE_THRESHOLD}
                THEN ${RANKING_WEIGHTS.SPAMMER_MULTIPLIER}
              ELSE 1.0
            END AS score
      FROM "MatchProfile" p
      LEFT JOIN "MatchSettings" s ON s."profileId" = p.id
      WHERE p.id != ${profileId}
        AND p."isActive" = true
        AND p."bannedAt" IS NULL
        AND p."shadowBanned" = false
        AND (p."pausedUntil" IS NULL OR p."pausedUntil" <= now())
        AND COALESCE(s."hideFromFeed", false) = false
        AND NOT EXISTS (
          SELECT 1
          FROM "User" u
          WHERE u.id = p."userId"
            AND (
              u."telegramId" LIKE ${LOCAL_DEMO_TELEGRAM_PREFIX}
              OR u."telegramId" = ${LOCAL_DEV_TELEGRAM_ID}
            )
        )
        AND (
          ${sameCityOnly}::boolean = false
          OR (
            LOWER(COALESCE(p.city, '')) = ${myCity}::text
            OR (
              ${myCityIsMoscow}::boolean = true
              AND LOWER(COALESCE(p.city, '')) IN ('москва', 'мск', 'moscow', 'санкт-петербург', 'спб', 'питер', 'saint petersburg')
            )
          )
        )
        AND (
          cardinality(${interestedWorkFormats}::"MatchWorkFormat"[]) = 0
          OR p."workFormats" && ${interestedWorkFormats}::"MatchWorkFormat"[]
        )
        AND (
          cardinality(${interestedMarketplaces}::"MatchMarketplace"[]) = 0
          OR p.marketplaces && ${interestedMarketplaces}::"MatchMarketplace"[]
        )
        AND (${experienceMin}::integer IS NULL OR COALESCE(p.experience, 0) >= ${experienceMin}::integer)
        AND (${experienceMax}::integer IS NULL OR COALESCE(p.experience, 0) <= ${experienceMax}::integer)
        AND (
          ${photoPreference}::"MatchPhotoPreference" = 'ANY'
          OR (
            ${photoPreference}::"MatchPhotoPreference" = 'WITH_PHOTO'
            AND (
              (p."avatarUrl" IS NOT NULL AND BTRIM(p."avatarUrl") <> '')
              OR EXISTS (
                SELECT 1
                FROM "MatchProfilePhoto" ph_filter
                WHERE ph_filter."profileId" = p.id
              )
            )
          )
          OR (
            ${photoPreference}::"MatchPhotoPreference" = 'WITHOUT_PHOTO'
            AND (p."avatarUrl" IS NULL OR BTRIM(p."avatarUrl") = '')
            AND NOT EXISTS (
              SELECT 1
              FROM "MatchProfilePhoto" ph_filter
              WHERE ph_filter."profileId" = p.id
            )
          )
        )
        AND (cardinality(${roles}::"MatchRole"[]) = 0 OR p.role = ANY(${roles}::"MatchRole"[]))
        AND (cardinality(${niches}::text[]) = 0 OR p.niches && ${niches}::text[])
        AND NOT EXISTS (
          SELECT 1
          FROM "MatchSwipe" sw
          WHERE sw."fromProfileId" = ${profileId}
            AND sw."toProfileId" = p.id
        )
      ORDER BY score DESC, p.id
      LIMIT ${limit}
      OFFSET ${offset}
    `
        : Prisma.sql`
      SELECT
        p.id,
        p.role,
        p."roleCustom",
        p."displayName",
        p.headline,
        p.bio,
        p.experience,
        p.city,
        p."birthDate",
        p."zodiacSign",
        p."workFormats",
        p.marketplaces,
        p."marketplacesCustom",
        p.niches,
        p.skills,
        p.tools,
        p."priceMin",
        p."priceMax",
        p.currency,
        p."avatarUrl",
        p.quadrant,
        p."activityScore",
        p."lastActiveAt",
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object('id', ph.id, 'url', ph.url, 'order', ph."order")
              ORDER BY ph."order", ph."createdAt"
            )
            FROM "MatchProfilePhoto" ph
            WHERE ph."profileId" = p.id
          ),
          '[]'::jsonb
        ) AS photos,
        p."portfolioUrl",
        p."telegramContact",
        p."isActive",
        false AS "incomingSuperLike"
      FROM "MatchProfile" p
      LEFT JOIN "MatchSettings" s ON s."profileId" = p.id
      WHERE p.id != ${profileId}
        AND p."isActive" = true
        AND p."bannedAt" IS NULL
        AND p."shadowBanned" = false
        AND (p."pausedUntil" IS NULL OR p."pausedUntil" <= now())
        AND COALESCE(s."hideFromFeed", false) = false
        AND NOT EXISTS (
          SELECT 1
          FROM "User" u
          WHERE u.id = p."userId"
            AND (
              u."telegramId" LIKE ${LOCAL_DEMO_TELEGRAM_PREFIX}
              OR u."telegramId" = ${LOCAL_DEV_TELEGRAM_ID}
            )
        )
        AND (
          ${sameCityOnly}::boolean = false
          OR (
            LOWER(COALESCE(p.city, '')) = ${myCity}::text
            OR (
              ${myCityIsMoscow}::boolean = true
              AND LOWER(COALESCE(p.city, '')) IN ('москва', 'мск', 'moscow', 'санкт-петербург', 'спб', 'питер', 'saint petersburg')
            )
          )
        )
        AND (
          cardinality(${interestedWorkFormats}::"MatchWorkFormat"[]) = 0
          OR p."workFormats" && ${interestedWorkFormats}::"MatchWorkFormat"[]
        )
        AND (
          cardinality(${interestedMarketplaces}::"MatchMarketplace"[]) = 0
          OR p.marketplaces && ${interestedMarketplaces}::"MatchMarketplace"[]
        )
        AND (${experienceMin}::integer IS NULL OR COALESCE(p.experience, 0) >= ${experienceMin}::integer)
        AND (${experienceMax}::integer IS NULL OR COALESCE(p.experience, 0) <= ${experienceMax}::integer)
        AND (
          ${photoPreference}::"MatchPhotoPreference" = 'ANY'
          OR (
            ${photoPreference}::"MatchPhotoPreference" = 'WITH_PHOTO'
            AND (
              (p."avatarUrl" IS NOT NULL AND BTRIM(p."avatarUrl") <> '')
              OR EXISTS (
                SELECT 1
                FROM "MatchProfilePhoto" ph_filter
                WHERE ph_filter."profileId" = p.id
              )
            )
          )
          OR (
            ${photoPreference}::"MatchPhotoPreference" = 'WITHOUT_PHOTO'
            AND (p."avatarUrl" IS NULL OR BTRIM(p."avatarUrl") = '')
            AND NOT EXISTS (
              SELECT 1
              FROM "MatchProfilePhoto" ph_filter
              WHERE ph_filter."profileId" = p.id
            )
          )
        )
        AND (cardinality(${roles}::"MatchRole"[]) = 0 OR p.role = ANY(${roles}::"MatchRole"[]))
        AND (cardinality(${niches}::text[]) = 0 OR p.niches && ${niches}::text[])
        AND NOT EXISTS (
          SELECT 1
          FROM "MatchSwipe" sw
          WHERE sw."fromProfileId" = ${profileId}
            AND sw."toProfileId" = p.id
        )
      ORDER BY p."lastActiveAt" DESC, p.id
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    );

    const now = Date.now();
    const items = rows.map((row) => {
      // activityBadge is the ONLY public surface for scoring. Everything
      // else (quadrant, activityScore, lastActiveAt) is stripped from
      // the response — we never show raw scores to the public.
      let activityBadge: ActivityBadge | null = null;
      if (reciprocityBadgesEnabled) {
        const activeTodayMs = now - row.lastActiveAt.getTime();
        if (
          row.quadrant === 'SOUGHT_AFTER' &&
          row.activityScore >= RANKING_WEIGHTS.WEEKLY_TOP_ACTIVITY_FLOOR
        ) {
          activityBadge = 'WEEKLY_TOP';
        } else if (activeTodayMs < 24 * 60 * 60 * 1000) {
          activityBadge = 'ACTIVE_TODAY';
        }
      }

      // Strip internal scoring fields from the response. The FeedCard
      // type on the client never sees quadrant/activityScore/lastActiveAt.
      const {
        quadrant: _q,
        activityScore: _a,
        lastActiveAt: _l,
        ...publicRow
      } = row;
      void _q;
      void _a;
      void _l;

      return {
        ...publicRow,
        roleLabel:
          row.role === 'CUSTOM' ? (row.roleCustom ?? 'CUSTOM') : row.role,
        telegramContact: null,
        incomingSuperLike: row.incomingSuperLike ?? false,
        photos: row.photos ?? [],
        activityBadge,
      };
    });
    return {
      items,
      hasMore: rows.length === limit,
      nextOffset: rows.length === limit ? offset + rows.length : null,
    };
  }
}
