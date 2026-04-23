import {
  ACTIVITY_SATURATION_LIKES,
  ACTIVITY_THRESHOLD,
  RECIPROCITY_PRIOR_WEIGHT,
  SUSPICION_CRITERIA,
  classifyQuadrant,
  computeActivityScore,
  computeReciprocityScore,
} from './activity-score.service';

describe('ActivityScoreService — pure functions', () => {
  describe('computeActivityScore', () => {
    it('returns 0 for no likes', () => {
      expect(computeActivityScore(0)).toBe(0);
    });

    it('clamps negative input to 0', () => {
      expect(computeActivityScore(-5)).toBe(0);
    });

    it('reaches ~1.0 exactly at the saturation threshold', () => {
      const score = computeActivityScore(ACTIVITY_SATURATION_LIKES);
      expect(score).toBeCloseTo(1, 5);
    });

    it('caps at 1.0 above saturation', () => {
      expect(computeActivityScore(ACTIVITY_SATURATION_LIKES * 5)).toBe(1);
      expect(computeActivityScore(1000)).toBe(1);
    });

    it('is monotonically increasing', () => {
      const a = computeActivityScore(1);
      const b = computeActivityScore(5);
      const c = computeActivityScore(20);
      const d = computeActivityScore(40);
      expect(b).toBeGreaterThan(a);
      expect(c).toBeGreaterThan(b);
      expect(d).toBeGreaterThan(c);
    });

    it('log-scales — 2x likes does not double the score', () => {
      // 5 likes should give less than half the score of 40 likes,
      // but more than ~30% — the whole point of log scaling.
      const low = computeActivityScore(5);
      const high = computeActivityScore(40);
      expect(low).toBeLessThan(high / 2);
      expect(low).toBeGreaterThan(high * 0.3);
    });
  });

  describe('computeReciprocityScore', () => {
    const P0 = 0.1;

    it('returns prior when no swipes have happened yet', () => {
      expect(computeReciprocityScore(0, 0, P0)).toBeCloseTo(P0, 10);
    });

    it('smooths aggressively on tiny samples', () => {
      // 1 match out of 1 like is NOT 100% — prior pulls it toward p0.
      const score = computeReciprocityScore(1, 1, P0);
      expect(score).toBeGreaterThan(P0);
      expect(score).toBeLessThan(0.5);
    });

    it('converges on true rate for large samples', () => {
      // 20 matches out of 100 sent = 20% raw matchRate. With α=10 and
      // p0=10%, smoothed rate = (20 + 1) / 110 ≈ 0.191.
      const score = computeReciprocityScore(20, 100, P0);
      expect(score).toBeCloseTo(0.19, 1);
    });

    it('is clamped at 1.0', () => {
      // Hypothetical pathological case — α + matches / α + sent can't exceed 1.
      const score = computeReciprocityScore(9999, 9999, P0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('handles negative input defensively', () => {
      expect(computeReciprocityScore(-5, 10, P0)).toBeGreaterThanOrEqual(0);
      expect(computeReciprocityScore(5, -10, P0)).toBeGreaterThanOrEqual(0);
    });

    it('weight α equals the designed constant', () => {
      // Adding α fake likes at the prior rate shouldn't change the score
      // much — this is the Bayesian invariant.
      const realRate = 0.3;
      const sent = 100;
      const matches = Math.round(realRate * sent);
      const withPrior = computeReciprocityScore(matches, sent, P0);
      const expected =
        (matches + RECIPROCITY_PRIOR_WEIGHT * P0) /
        (sent + RECIPROCITY_PRIOR_WEIGHT);
      expect(withPrior).toBeCloseTo(expected, 10);
    });
  });

  describe('classifyQuadrant', () => {
    const THRESHOLD = 0.1; // same as typical P0

    it('SOUGHT_AFTER — high activity + high reciprocity', () => {
      expect(
        classifyQuadrant({
          activityScore: 0.8,
          reciprocityScore: 0.2,
          reciprocityThreshold: THRESHOLD,
        }),
      ).toBe('SOUGHT_AFTER');
    });

    it('SELECTIVE — low activity + high reciprocity', () => {
      expect(
        classifyQuadrant({
          activityScore: 0.2,
          reciprocityScore: 0.25,
          reciprocityThreshold: THRESHOLD,
        }),
      ).toBe('SELECTIVE');
    });

    it('OVER_LIKER — high activity + low reciprocity', () => {
      expect(
        classifyQuadrant({
          activityScore: 0.7,
          reciprocityScore: 0.02,
          reciprocityThreshold: THRESHOLD,
        }),
      ).toBe('OVER_LIKER');
    });

    it('SLEEPING — low activity + low reciprocity', () => {
      expect(
        classifyQuadrant({
          activityScore: 0.05,
          reciprocityScore: 0.02,
          reciprocityThreshold: THRESHOLD,
        }),
      ).toBe('SLEEPING');
    });

    it('boundary at activity threshold is inclusive-high', () => {
      // Exactly at threshold → treated as HIGH (SOUGHT_AFTER over OVER_LIKER).
      expect(
        classifyQuadrant({
          activityScore: ACTIVITY_THRESHOLD,
          reciprocityScore: THRESHOLD, // exactly at rec threshold too
          reciprocityThreshold: THRESHOLD,
        }),
      ).toBe('SOUGHT_AFTER');
    });

    it('respects a custom activity threshold', () => {
      expect(
        classifyQuadrant({
          activityScore: 0.5,
          reciprocityScore: 0.2,
          reciprocityThreshold: THRESHOLD,
          activityThreshold: 0.6, // higher bar
        }),
      ).toBe('SELECTIVE'); // activity below custom bar
    });
  });

  // Regression guards on the SUSPICION_CRITERIA constants. These values
  // directly affect anti-bot writes; changing them without thought could
  // either flood the admin queue or silently stop catching bots.
  describe('SUSPICION_CRITERIA — regression bounds', () => {
    it('ACTIVITY_MIN is strict enough to avoid false positives', () => {
      // We want to flag only obvious spammers, not power users. A threshold
      // at 0.9 corresponds to ~38+ likes/14 days — clearly abnormal.
      expect(SUSPICION_CRITERIA.ACTIVITY_MIN).toBeGreaterThanOrEqual(0.85);
    });

    it('RECIPROCITY_MAX is low enough to avoid penalising real humans', () => {
      // A real human rarely drops below 3% matchRate on a reasonable
      // sample — 0.03 stays well under the population mean.
      expect(SUSPICION_CRITERIA.RECIPROCITY_MAX).toBeLessThanOrEqual(0.05);
    });

    it('ACCOUNT_AGE_MAX_DAYS keeps the window to fresh accounts', () => {
      // Older accounts that become over-likers are a different problem
      // (likely churn), not bot infiltration.
      expect(SUSPICION_CRITERIA.ACCOUNT_AGE_MAX_DAYS).toBeLessThanOrEqual(30);
    });
  });
});
