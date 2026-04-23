-- CreateEnum
CREATE TYPE "MatchRole" AS ENUM ('SELLER', 'MANAGER', 'DESIGNER', 'AD_BUYER', 'EXPERT', 'PRODUCTION', 'FULFILLMENT', 'CARGO', 'ANALYTICS_SERVICE', 'LOGISTIC', 'BLOGGER', 'ACCOUNTANT', 'LAWYER', 'PRODUCT_SOURCER', 'ASSISTANTS', 'WHITE_IMPORT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MatchWorkFormat" AS ENUM ('REMOTE', 'OFFICE', 'HYBRID');

-- CreateEnum
CREATE TYPE "MatchMarketplace" AS ENUM ('WB', 'OZON', 'YANDEX_MARKET', 'MVIDEO', 'LAMODA', 'OTHER');

-- CreateEnum
CREATE TYPE "SwipeDirection" AS ENUM ('LIKE', 'PASS');

-- CreateEnum
CREATE TYPE "MatchEventType" AS ENUM ('MINIAPP_OPENED', 'PROFILE_CREATED', 'PROFILE_UPDATED', 'SWIPE_LIKE', 'SWIPE_PASS', 'SWIPE_SUPER', 'SWIPE_UNDO', 'SWIPE_RESET', 'MATCH_CREATED', 'MESSAGE_SENT', 'CONTACT_REVEALED', 'INVITE_REDEEMED', 'INVITE_ISSUED', 'INVITE_REVOKED', 'PROFILE_PAUSED', 'PROFILE_UNPAUSED', 'BANNED', 'UNBANNED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MatchRole" NOT NULL,
    "roleCustom" TEXT,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "city" TEXT,
    "birthDate" DATE,
    "zodiacSign" TEXT,
    "workFormats" "MatchWorkFormat"[],
    "marketplaces" "MatchMarketplace"[],
    "marketplacesCustom" TEXT,
    "niches" TEXT[],
    "skills" TEXT[],
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "avatarUrl" TEXT,
    "portfolioUrl" TEXT,
    "telegramContact" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "likeRateRecent" DOUBLE PRECISION,
    "nextInviteGrantAt" TIMESTAMP(3),
    "swipeStreakDays" INTEGER NOT NULL DEFAULT 0,
    "swipeStreakLastDay" DATE,
    "superLikeBalance" INTEGER NOT NULL DEFAULT 0,
    "lastDigestSentAt" TIMESTAMP(3),
    "lastPendingLikesPingAt" TIMESTAMP(3),
    "pausedUntil" TIMESTAMP(3),
    "lastUndoAt" TIMESTAMP(3),
    "lastSwipeResetAt" TIMESTAMP(3),
    "notificationsMuted" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "banReason" TEXT,
    "shadowBanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSettings" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "interestedRoles" "MatchRole"[],
    "interestedWorkFormats" "MatchWorkFormat"[],
    "sameCityOnly" BOOLEAN NOT NULL DEFAULT false,
    "interestedMarketplaces" "MatchMarketplace"[],
    "interestedNiches" TEXT[],
    "hideFromFeed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSwipe" (
    "id" TEXT NOT NULL,
    "fromProfileId" TEXT NOT NULL,
    "toProfileId" TEXT NOT NULL,
    "direction" "SwipeDirection" NOT NULL,
    "isSuperLike" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSwipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPair" (
    "id" TEXT NOT NULL,
    "profileAId" TEXT NOT NULL,
    "profileBId" TEXT NOT NULL,
    "archivedByProfileIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchMessage" (
    "id" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "senderProfileId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "systemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchPairRead" (
    "id" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPairRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchProfilePhoto" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchProfilePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchInviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerProfileId" TEXT,
    "usedByProfileId" TEXT,
    "usedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "MatchInviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEventLog" (
    "id" BIGSERIAL NOT NULL,
    "profileId" TEXT,
    "userId" TEXT,
    "type" "MatchEventType" NOT NULL,
    "targetProfileId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSpamSignal" (
    "profileId" TEXT NOT NULL,
    "likeRateRecent" DOUBLE PRECISION,
    "swipesPerMinutePeak" DOUBLE PRECISION,
    "zeroMatchRatio" DOUBLE PRECISION,
    "duplicateFirstMsgCount" INTEGER NOT NULL DEFAULT 0,
    "invitedBurstFlag" BOOLEAN NOT NULL DEFAULT false,
    "suspicionScore" INTEGER NOT NULL DEFAULT 0,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchSpamSignal_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "MatchDailyAggregate" (
    "day" DATE NOT NULL,
    "newProfiles" INTEGER NOT NULL DEFAULT 0,
    "activeProfiles" INTEGER NOT NULL DEFAULT 0,
    "swipes" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "superLikes" INTEGER NOT NULL DEFAULT 0,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "contactReveals" INTEGER NOT NULL DEFAULT 0,
    "invitesIssued" INTEGER NOT NULL DEFAULT 0,
    "invitesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchDailyAggregate_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "MatchAdminAudit" (
    "id" BIGSERIAL NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetProfileId" TEXT,
    "payload" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchAdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchProfile_userId_key" ON "MatchProfile"("userId");

-- CreateIndex
CREATE INDEX "MatchProfile_role_idx" ON "MatchProfile"("role");

-- CreateIndex
CREATE INDEX "MatchProfile_isActive_idx" ON "MatchProfile"("isActive");

-- CreateIndex
CREATE INDEX "MatchProfile_lastActiveAt_idx" ON "MatchProfile"("lastActiveAt");

-- CreateIndex
CREATE INDEX "MatchProfile_pausedUntil_idx" ON "MatchProfile"("pausedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "MatchSettings_profileId_key" ON "MatchSettings"("profileId");

-- CreateIndex
CREATE INDEX "MatchSwipe_fromProfileId_idx" ON "MatchSwipe"("fromProfileId");

-- CreateIndex
CREATE INDEX "MatchSwipe_toProfileId_idx" ON "MatchSwipe"("toProfileId");

-- CreateIndex
CREATE INDEX "MatchSwipe_fromProfileId_createdAt_idx" ON "MatchSwipe"("fromProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchSwipe_toProfileId_direction_createdAt_idx" ON "MatchSwipe"("toProfileId", "direction", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchSwipe_fromProfileId_toProfileId_key" ON "MatchSwipe"("fromProfileId", "toProfileId");

-- CreateIndex
CREATE INDEX "MatchPair_profileAId_idx" ON "MatchPair"("profileAId");

-- CreateIndex
CREATE INDEX "MatchPair_profileBId_idx" ON "MatchPair"("profileBId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPair_profileAId_profileBId_key" ON "MatchPair"("profileAId", "profileBId");

-- CreateIndex
CREATE INDEX "MatchMessage_pairId_createdAt_idx" ON "MatchMessage"("pairId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchPairRead_profileId_idx" ON "MatchPairRead"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPairRead_pairId_profileId_key" ON "MatchPairRead"("pairId", "profileId");

-- CreateIndex
CREATE INDEX "MatchProfilePhoto_profileId_order_idx" ON "MatchProfilePhoto"("profileId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MatchInviteCode_code_key" ON "MatchInviteCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MatchInviteCode_usedByProfileId_key" ON "MatchInviteCode"("usedByProfileId");

-- CreateIndex
CREATE INDEX "MatchInviteCode_ownerProfileId_idx" ON "MatchInviteCode"("ownerProfileId");

-- CreateIndex
CREATE INDEX "MatchInviteCode_usedByProfileId_idx" ON "MatchInviteCode"("usedByProfileId");

-- CreateIndex
CREATE INDEX "MatchEventLog_profileId_createdAt_idx" ON "MatchEventLog"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchEventLog_type_createdAt_idx" ON "MatchEventLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "MatchEventLog_createdAt_idx" ON "MatchEventLog"("createdAt");

-- CreateIndex
CREATE INDEX "MatchAdminAudit_adminUserId_createdAt_idx" ON "MatchAdminAudit"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchAdminAudit_targetProfileId_createdAt_idx" ON "MatchAdminAudit"("targetProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchAdminAudit_action_createdAt_idx" ON "MatchAdminAudit"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "MatchProfile" ADD CONSTRAINT "MatchProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSettings" ADD CONSTRAINT "MatchSettings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MatchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSwipe" ADD CONSTRAINT "MatchSwipe_fromProfileId_fkey" FOREIGN KEY ("fromProfileId") REFERENCES "MatchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSwipe" ADD CONSTRAINT "MatchSwipe_toProfileId_fkey" FOREIGN KEY ("toProfileId") REFERENCES "MatchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchMessage" ADD CONSTRAINT "MatchMessage_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "MatchPair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchMessage" ADD CONSTRAINT "MatchMessage_senderProfileId_fkey" FOREIGN KEY ("senderProfileId") REFERENCES "MatchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPairRead" ADD CONSTRAINT "MatchPairRead_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "MatchPair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchProfilePhoto" ADD CONSTRAINT "MatchProfilePhoto_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MatchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchInviteCode" ADD CONSTRAINT "MatchInviteCode_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "MatchProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchInviteCode" ADD CONSTRAINT "MatchInviteCode_usedByProfileId_fkey" FOREIGN KEY ("usedByProfileId") REFERENCES "MatchProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEventLog" ADD CONSTRAINT "MatchEventLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MatchProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSpamSignal" ADD CONSTRAINT "MatchSpamSignal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "MatchProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchAdminAudit" ADD CONSTRAINT "MatchAdminAudit_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
