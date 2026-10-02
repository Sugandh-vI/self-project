-- Keep the Google account photo when the user uploads their own, so deleting an
-- upload can restore it instead of dropping the account to an initials avatar.
ALTER TABLE "User" ADD COLUMN "providerImage" TEXT;

-- Backfill: no uploads exist yet, so every current `image` is still the Google
-- photo. Without this, existing accounts would lose their avatar permanently
-- the first time they removed an upload — they've already finished onboarding,
-- which is the only other place the column gets set.
UPDATE "User" SET "providerImage" = "image" WHERE "providerImage" IS NULL;
