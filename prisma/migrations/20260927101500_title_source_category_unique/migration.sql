-- Title cache dedup key must include `category`.
--
-- TMDb movie and TV IDs are independent sequences that collide numerically
-- (TMDb staff, verbatim: "Entry number 1396 in the TV section is Breaking Bad
-- and entry 1396 in the movie section is Mirror"). With the old
-- (source, sourceId) unique, upserting the movie "Mirror" found the cached
-- Breaking Bad row and returned it unchanged: the Movie tab then displayed a
-- TV show, and the movie was never cached.
--
-- Safe to apply: the old key was stricter, so no existing row can violate the
-- new one. It is a pure index swap — no data is rewritten.

DROP INDEX IF EXISTS "Title_source_sourceId_key";

CREATE UNIQUE INDEX "Title_source_category_sourceId_key" ON "Title"("source", "category", "sourceId");
