-- Feed hot-path partial indexes.
--
-- Контекст: основной запрос ленты в apps/api/src/modules/match/feed.service.ts
-- всегда отбирает «активных кандидатов»:
--   WHERE isActive = true AND bannedAt IS NULL AND shadowBanned = false
--     AND (pausedUntil IS NULL OR pausedUntil <= now())
-- затем сортирует по score DESC, p.id (ranking-ветка) или по lastActiveAt
-- (fallback). Одиночные @@index([isActive]) / ([pausedUntil]) / ([lastActiveAt])
-- заставляли planner делать BitmapAnd по широким сканам; partial index на
-- этом условии компактнее на порядок и покрывает сортировку.
--
-- Важно: prisma migrate deploy выполняет миграцию в транзакции, поэтому
-- `CREATE INDEX CONCURRENTLY` здесь нельзя использовать (Postgres 25001).
-- Используем обычный CREATE INDEX IF NOT EXISTS для совместимости.

-- 1. Сортировка / покрывающий для ranking-ветки и fallback'а.
CREATE INDEX IF NOT EXISTS "idx_MatchProfile_feed_active_lastActive"
  ON "MatchProfile" ("lastActiveAt" DESC)
  WHERE "isActive" = true
    AND "bannedAt" IS NULL
    AND "shadowBanned" = false;

-- 2. Покрытие pausedUntil: выбираем либо NULL (всегда активен), либо уже
-- истекшую паузу. Предикат записан без now() (immutable-требование для
-- partial index'ов), pausedUntil <= now() отфильтруется планировщиком.
CREATE INDEX IF NOT EXISTS "idx_MatchProfile_feed_pausedUntil"
  ON "MatchProfile" ("pausedUntil")
  WHERE "isActive" = true
    AND "bannedAt" IS NULL
    AND "shadowBanned" = false;
