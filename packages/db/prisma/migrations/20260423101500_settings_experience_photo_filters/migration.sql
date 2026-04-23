-- Add experience and photo presence filters for MatchSettings.
CREATE TYPE "MatchPhotoPreference" AS ENUM ('ANY', 'WITH_PHOTO', 'WITHOUT_PHOTO');

ALTER TABLE "MatchSettings"
ADD COLUMN "experienceMin" INTEGER,
ADD COLUMN "experienceMax" INTEGER,
ADD COLUMN "photoPreference" "MatchPhotoPreference" NOT NULL DEFAULT 'ANY';

ALTER TABLE "MatchSettings"
ADD CONSTRAINT "MatchSettings_experience_range_check"
CHECK (
  "experienceMin" IS NULL
  OR "experienceMax" IS NULL
  OR "experienceMin" <= "experienceMax"
);
