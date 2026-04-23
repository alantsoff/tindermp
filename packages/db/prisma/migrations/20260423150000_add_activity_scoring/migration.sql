-- CreateEnum
CREATE TYPE "MatchActivityQuadrant" AS ENUM ('SOUGHT_AFTER', 'SELECTIVE', 'OVER_LIKER', 'SLEEPING');

-- AlterTable
ALTER TABLE "MatchProfile"
  ADD COLUMN "likesSent14d"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "likesReceived14d"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "matches14d"         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "activityScore"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "reciprocityScore"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "quadrant"           "MatchActivityQuadrant" NOT NULL DEFAULT 'SLEEPING',
  ADD COLUMN "scoreUpdatedAt"     TIMESTAMP(3);

-- Index for quadrant-based lookups (admin, analytics).
CREATE INDEX "MatchProfile_quadrant_idx" ON "MatchProfile"("quadrant");
