import { Injectable, Logger } from '@nestjs/common';
import { MatchActivityQuadrant } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { profileCompleteness } from './match.utils';

/**
 * Activity × reciprocity scoring — see docs/CURSOR_TASKS_ACTIVITY_SCORE.md
 * for the full rollout plan and design rationale.
 *
 * This service populates six columns on MatchProfile nightly:
 *   likesSent14d, likesReceived14d, matches14d,
 *   activityScore, reciprocityScore, quadrant.
 *
 * All writes are shadow-safe: consumers (feed ranking, UI badges, profile
 * section) gate their reads on separate sub-flags so this job can run for
 * a week in silence before any quadrant-driven behaviour ships.
 */

// --- Pure functions (unit-testable, no Prisma dependency) ----------------

/** α in Bayesian smoothing. Balances small-sample noise vs. responsiveness. */
export const RECIPROCITY_PRIOR_WEIGHT = 10;

/** Number of sent likes that saturates the activity score at 1.0. */
export const ACTIVITY_SATURATION_LIKES = 40;

/** Activity threshold splitting low/high on the 0..1 scale. */
export const ACTIVITY_THRESHOLD = 0.35;

/**
 * Anti-bot suspicion thresholds. A profile ticking ALL four boxes gets
 * a suspicion bump in MatchSpamSignal — this is purely shadow (admins
 * review via the existing spam pipeline, UI doesn't react).
 */
export const SUSPICION_CRITERIA = {
  ACTIVITY_MIN: 0.9,
  RECIPROCITY_MAX: 0.03,
  COMPLETENESS_MAX: 0.5,
  ACCOUNT_AGE_MAX_DAYS: 14,
  /** Score bump written to MatchSpamSignal.suspicionScore when flagged. */
  SUSPICION_BUMP: 40,
} as const;

/**
 * Log-scaled activity score in [0, 1].
 * 0 likes → 0; ACTIVITY_SATURATION_LIKES likes → 1; monotonic in between.
 * Log-scaling intentionally disincentivises mass-swiping past ~40.
 */
export function computeActivityScore(likesSent14d: number): number {
  if (likesSent14d <= 0) return 0;
  const raw = Math.log1p(likesSent14d) / Math.log1p(ACTIVITY_SATURATION_LIKES);
  return Math.min(1, raw);
}

/**
 * Bayesian-smoothed reciprocity in [0, 1].
 * With zero history returns the global prior (p0). With a large sample
 * converges on the raw matchRate. Prevents "1 match out of 1 like = 100%"
 * nonsense on brand-new profiles.
 */
export function computeReciprocityScore(
  matches14d: number,
  likesSent14d: number,
  globalMatchRate: number,
): number {
  const safeMatches = Math.max(0, matches14d);
  const safeSent = Math.max(0, likesSent14d);
  const safePrior = Math.max(0, Math.min(1, globalMatchRate));
  const numerator = safeMatches + RECIPROCITY_PRIOR_WEIGHT * safePrior;
  const denominator = safeSent + RECIPROCITY_PRIOR_WEIGHT;
  if (denominator <= 0) return safePrior;
  return Math.min(1, numerator / denominator);
}

/**
 * 2×2 classification. The reciprocity threshold is the population mean,
 * so a healthy distribution produces roughly equal quadrant sizes.
 */
export function classifyQuadrant(params: {
  activityScore: number;
  reciprocityScore: number;
  reciprocityThreshold: number;
  activityThreshold?: number;
}): MatchActivityQuadrant {
  const activityHigh =
    params.activityScore >= (params.activityThreshold ?? ACTIVITY_THRESHOLD);
  const reciprocityHigh =
    params.reciprocityScore >= params.reciprocityThreshold;

  if (activityHigh && reciprocityHigh) return 'SOUGHT_AFTER';
  if (!activityHigh && reciprocityHigh) return 'SELECTIVE';
  if (activityHigh && !reciprocityHigh) return 'OVER_LIKER';
  return 'SLEEPING';
}

// --- Service ------------------------------------------------------------

type AggregateRow = {
  profileId: string;
  likesSent: number;
  likesReceived: number;
  matches: number;
};

@Injectable()
export class ActivityScoreService {
  private readonly logger = new Logger(ActivityScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recompute 14-day activity × reciprocity for all profiles that had at
   * least one outgoing or incoming swipe in the window. Profiles outside
   * this set keep their previous (possibly zero) score — no need to touch
   * completely idle rows every night.
   */
  async recalcActivityScores(): Promise<{ updated: number }> {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Global matchRate prior — used to smooth tiny samples. Computed
    // once per run so the whole cohort is compared against the same p0.
    const globalMatchRate = await this.computeGlobalMatchRate(since);

    // Pull per-profile aggregates in one round-trip each.
    const [sentRows, receivedRows, matchesA, matchesB] = await Promise.all([
      this.prisma.$queryRaw<Array<{ fromProfileId: string; c: bigint }>>`
        SELECT "fromProfileId", COUNT(*)::bigint AS c
        FROM "MatchSwipe"
        WHERE direction = 'LIKE' AND "createdAt" >= ${since}
        GROUP BY "fromProfileId"
      `,
      this.prisma.$queryRaw<Array<{ toProfileId: string; c: bigint }>>`
        SELECT "toProfileId", COUNT(*)::bigint AS c
        FROM "MatchSwipe"
        WHERE direction = 'LIKE' AND "createdAt" >= ${since}
        GROUP BY "toProfileId"
      `,
      this.prisma.$queryRaw<Array<{ profileAId: string; c: bigint }>>`
        SELECT "profileAId", COUNT(*)::bigint AS c
        FROM "MatchPair"
        WHERE "createdAt" >= ${since}
        GROUP BY "profileAId"
      `,
      this.prisma.$queryRaw<Array<{ profileBId: string; c: bigint }>>`
        SELECT "profileBId", COUNT(*)::bigint AS c
        FROM "MatchPair"
        WHERE "createdAt" >= ${since}
        GROUP BY "profileBId"
      `,
    ]);

    const agg = new Map<string, AggregateRow>();
    const touch = (id: string): AggregateRow => {
      let row = agg.get(id);
      if (!row) {
        row = { profileId: id, likesSent: 0, likesReceived: 0, matches: 0 };
        agg.set(id, row);
      }
      return row;
    };

    for (const r of sentRows) touch(r.fromProfileId).likesSent = Number(r.c);
    for (const r of receivedRows)
      touch(r.toProfileId).likesReceived = Number(r.c);
    for (const r of matchesA) touch(r.profileAId).matches += Number(r.c);
    for (const r of matchesB) touch(r.profileBId).matches += Number(r.c);

    if (agg.size === 0) {
      this.logger.log('No recent swipes — nothing to score');
      return { updated: 0 };
    }

    // Update in chunks to keep transactions short on large cohorts.
    const CHUNK = 200;
    const rows = Array.from(agg.values());
    let updated = 0;
    const now = new Date();

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        chunk.map((row) => {
          const activityScore = computeActivityScore(row.likesSent);
          const reciprocityScore = computeReciprocityScore(
            row.matches,
            row.likesSent,
            globalMatchRate,
          );
          const quadrant = classifyQuadrant({
            activityScore,
            reciprocityScore,
            reciprocityThreshold: globalMatchRate,
          });
          return this.prisma.matchProfile.update({
            where: { id: row.profileId },
            data: {
              likesSent14d: row.likesSent,
              likesReceived14d: row.likesReceived,
              matches14d: row.matches,
              activityScore,
              reciprocityScore,
              quadrant,
              scoreUpdatedAt: now,
            },
            // Narrow select so Prisma doesn't ship the full row back.
            select: { id: true },
          });
        }),
      );
      updated += chunk.length;
    }

    this.logger.log(
      `Activity scores recomputed: ${updated} profiles, p0=${globalMatchRate.toFixed(3)}`,
    );

    // Downstream: populate the anti-bot shadow signal for freshly-updated
    // profiles. Runs after score write so we read the latest quadrant.
    // Purely shadow — MatchSpamSignal is consumed by admin tooling only.
    try {
      const flagged = await this.flagSuspiciousProfiles();
      if (flagged > 0) {
        this.logger.log(`anti-bot shadow: bumped suspicion on ${flagged}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`anti-bot shadow failed: ${message}`);
      // Never re-throw — scoring succeeded, suspicion is optional.
    }

    return { updated };
  }

  /**
   * Shadow-write anti-bot suspicion into MatchSpamSignal for profiles
   * that tick all four boxes: extreme activity, near-zero reciprocity,
   * incomplete profile, fresh account. No user-facing effect — this just
   * populates the admin review queue.
   */
  private async flagSuspiciousProfiles(): Promise<number> {
    const ageCutoff = new Date(
      Date.now() -
        SUSPICION_CRITERIA.ACCOUNT_AGE_MAX_DAYS * 24 * 60 * 60 * 1000,
    );
    const candidates = await this.prisma.matchProfile.findMany({
      where: {
        activityScore: { gt: SUSPICION_CRITERIA.ACTIVITY_MIN },
        reciprocityScore: { lt: SUSPICION_CRITERIA.RECIPROCITY_MAX },
        createdAt: { gt: ageCutoff },
      },
      select: {
        id: true,
        headline: true,
        bio: true,
        avatarUrl: true,
        city: true,
        experience: true,
        niches: true,
        skills: true,
        workFormats: true,
        photos: { select: { id: true } },
        reciprocityScore: true,
      },
      take: 500,
    });

    let flagged = 0;
    for (const profile of candidates) {
      const completeness = profileCompleteness(profile);
      if (completeness >= SUSPICION_CRITERIA.COMPLETENESS_MAX) continue;

      // Upsert: either bump existing suspicion row, or create a new one
      // with the baseline bump. zeroMatchRatio is a natural companion
      // signal — 1 − reciprocity. scoredAt updates each pass.
      const zeroMatchRatio = Math.max(0, 1 - profile.reciprocityScore);
      await this.prisma.matchSpamSignal.upsert({
        where: { profileId: profile.id },
        create: {
          profileId: profile.id,
          suspicionScore: SUSPICION_CRITERIA.SUSPICION_BUMP,
          zeroMatchRatio,
        },
        update: {
          suspicionScore: { increment: SUSPICION_CRITERIA.SUSPICION_BUMP },
          zeroMatchRatio,
          scoredAt: new Date(),
        },
      });
      flagged += 1;
    }
    return flagged;
  }

  /**
   * Average matchRate across the population for the 14-day window, used
   * as the Bayesian prior and as the reciprocity threshold. Falls back to
   * 0.1 (10%) when the platform is too young to have a meaningful average.
   */
  private async computeGlobalMatchRate(since: Date): Promise<number> {
    const [likesRow, matchesRow] = await Promise.all([
      this.prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*)::bigint AS c
        FROM "MatchSwipe"
        WHERE direction = 'LIKE' AND "createdAt" >= ${since}
      `,
      this.prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*)::bigint AS c
        FROM "MatchPair"
        WHERE "createdAt" >= ${since}
      `,
    ]);
    const totalLikes = Number(likesRow[0]?.c ?? 0n);
    // Each pair consumes exactly two LIKEs (one each way). Using 2·pairs
    // avoids double-counting the outgoing LIKE that created the match.
    const totalMatches = Number(matchesRow[0]?.c ?? 0n) * 2;
    if (totalLikes < 50) return 0.1; // cold-start fallback
    return Math.min(1, totalMatches / totalLikes);
  }

  /**
   * Fetch a single profile's scoring snapshot — used by profile/me to
   * power the "Ваша активность" section. Returns null if scoring hasn't
   * run yet (fresh profile, first cron not fired).
   */
  async getProfileSnapshot(profileId: string): Promise<{
    likesSent14d: number;
    likesReceived14d: number;
    matches14d: number;
    activityScore: number;
    reciprocityScore: number;
    quadrant: MatchActivityQuadrant;
    scoreUpdatedAt: Date | null;
  } | null> {
    const row = await this.prisma.matchProfile.findUnique({
      where: { id: profileId },
      select: {
        likesSent14d: true,
        likesReceived14d: true,
        matches14d: true,
        activityScore: true,
        reciprocityScore: true,
        quadrant: true,
        scoreUpdatedAt: true,
      },
    });
    if (!row) return null;
    return row;
  }
}

// Re-export Prisma enum for convenience (consumers shouldn't import from
// @prisma/client directly — keeps our module boundaries clean).
export type { MatchActivityQuadrant };
export const MATCH_ACTIVITY_QUADRANT_VALUES: MatchActivityQuadrant[] = [
  'SOUGHT_AFTER',
  'SELECTIVE',
  'OVER_LIKER',
  'SLEEPING',
];
