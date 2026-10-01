-- Index support for the friends + feed read paths (design: journey.md §6).
--
-- Two indexes are added and one is widened. Nothing is dropped without a
-- replacement, no column changes and no data rewrite, so this is safe to apply
-- on a live database (CREATE INDEX takes a write lock on a small table, which
-- is the only thing to be aware of once there is real traffic).
--
-- 1. `Post_userId_idx` -> `Post_userId_createdAt_idx`.
--    The friends feed reads `WHERE userId IN (<friend ids>) ORDER BY createdAt
--    DESC` and a profile's grouped posts read `WHERE userId = ? ORDER BY
--    createdAt DESC` — both are exactly (userId, createdAt). The composite
--    still serves plain userId lookups because userId is the leading column.
--
-- 2. New `Friendship_requesterId_status_idx` and
--    `Friendship_recipientId_status_idx`.
--    The only existing index is the directional unique
--    (requesterId, recipientId), which serves "requests I sent" but not
--    "requests sent to me". Every page load queries BOTH directions — friend
--    list, incoming/outgoing requests, and feed membership (an accepted row can
--    have the viewer on either side). Without these, those lookups seq-scan.
--    Status leads the filter in each query, so it is part of both indexes.

DROP INDEX IF EXISTS "Post_userId_idx";

CREATE INDEX "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt");

CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

CREATE INDEX "Friendship_recipientId_status_idx" ON "Friendship"("recipientId", "status");
