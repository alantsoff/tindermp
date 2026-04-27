-- Notifications opt-out + event types for NotificationService.
--
-- ALTER TYPE ADD VALUE: разрешено внутри транзакции в PG 12+, новые значения
-- нельзя использовать в той же транзакции. Прима миграция запускается в одной
-- транзакции, мы только добавляем значения и колонки — не вставляем строки с
-- новыми enum-значениями, поэтому проблем не будет.

-- AlterEnum: добавляем типы событий для нотификаций.
ALTER TYPE "MatchEventType" ADD VALUE 'NOTIFICATION_SENT';
ALTER TYPE "MatchEventType" ADD VALUE 'NOTIFICATION_THROTTLED';

-- AlterTable: per-type opt-out флаги в MatchSettings. Defaults true потому
-- что mini-app в Telegram — push из бота это ожидаемое поведение, opt-out
-- удобнее opt-in. Существующие строки backfill'ятся в true автоматически.
ALTER TABLE "MatchSettings"
  ADD COLUMN "notifyMatch"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyIncomingLike" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyMessage"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyInvite"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyDigest"       BOOLEAN NOT NULL DEFAULT true;
