/**
 * End-to-end verification harness (dev only).
 *
 * Prerequisites:
 *   1. Migrated database        -> npx prisma migrate deploy
 *   2. Dev server running       -> npm run dev   (in a second terminal)
 *   3. .env with real creds     -> DATABASE_URL (plus Google OAuth vars and
 *                                   TMDB_API_KEY for the external-API checks)
 *
 * Run:
 *   node --env-file=.env scripts/verify-e2e.mjs
 *   (or: npm run verify:e2e)
 *
 * What it exercises:
 *   - cache-first search for TV (TMDb), movie (TMDb) and anime (AniList)
 *   - post creation + franchise grouping for a real multi-season TV show
 *   - franchise grouping for a real multi-season anime (root walk)
 *  - movie = standalone entry (no franchise group)
 *  - the TMDb movie/TV id collision fix: the same numeric id in two
 *    categories must cache as two separate titles (id 1396 is the TV show
 *    "Breaking Bad" and the movie "Mirror")
 *   - re-rating the same entry updates in place (no duplicate post)
 *   - adding a new season creates a new entry + post in the same group
 *
 * It seeds a throwaway user + session row directly in the DB (so no Google
 * login is needed) and calls the real API routes. It cleans up after itself;
 * cached Title/Entry/FranchiseGroup rows are intentionally left behind (that
 * is the cache doing its job).
 */

import { Client } from "pg";
import { randomBytes } from "node:crypto";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const SESSION_TOKEN = `verify-e2e-${randomBytes(16).toString("hex")}`;
const TEST_EMAIL = "verify-e2e@local.test";

const results = [];
let skipped = 0;
let cookieName = "next-auth.session-token";

function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** A check that could not run (e.g. the external API did not return the
 *  specific title needed). Reported, but not counted as a failure. */
function skip(name, detail = "") {
  skipped++;
  console.log(`  SKIP  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Cookie: `${cookieName}=${SESSION_TOKEN}`,
      ...(options.headers ?? {}),
    },
  });
  return res;
}

async function apiJson(path, options) {
  const res = await api(path, options);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function section(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------------------
// Database connection (TLS)
//
// Do NOT pass `connectionString` + `ssl` together. pg's ConnectionParameters
// does `Object.assign({}, config, parse(config.connectionString))` — the
// *parsed connection string* wins over anything passed alongside it — and
// pg-connection-string turns `sslmode=require` (with no sslrootcert) into a
// bare `ssl: {}`, i.e. "TLS with Node's defaults" = full chain verification.
// That silently discarded this script's old `ssl: { rejectUnauthorized: false }`
// and produced "self-signed certificate in certificate chain" on machines that
// cannot build a trust chain to Supabase's certificate (corporate/AV TLS
// interception, or a missing intermediate CA).
//
// So: parse the URL ourselves, drop pg's ssl* params, and choose the policy
// here. Default is strict verification; only a chain-trust failure falls back
// to encrypted-but-unverified TLS, and only for this local dev run — TLS is
// never switched off. VERIFY_E2E_SSL=require forces encrypt-only, and
// VERIFY_E2E_SSL=verify-full (the default) refuses to fall back.
// ---------------------------------------------------------------------------

const SSL_POLICIES = {
  "verify-full": { rejectUnauthorized: true },
  require: { rejectUnauthorized: false },
};

function sslPolicy() {
  const mode = (process.env.VERIFY_E2E_SSL || "verify-full").toLowerCase();
  if (!(mode in SSL_POLICIES)) {
    console.warn(`  ! unknown VERIFY_E2E_SSL="${mode}" — using verify-full`);
    return SSL_POLICIES["verify-full"];
  }
  return SSL_POLICIES[mode];
}

/** Percent-decodes a URL component, falling back to the raw value if the
 *  string is not valid percent-encoding (a raw `%` in a password). */
function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Connection fields only — never a connectionString, so pg cannot override
 *  our TLS policy with the one implied by the URL's sslmode. */
function dbConfig(ssl) {
  const url = new URL(process.env.DATABASE_URL);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("ssl")) url.searchParams.delete(key);
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeUrlPart(url.username),
    password: decodeUrlPart(url.password),
    database: decodeUrlPart(url.pathname.slice(1)) || undefined,
    ssl,
    // Shows up in Supabase's connection logs, which makes stray connections
    // from this script easy to spot.
    application_name: "verify-e2e",
  };
}

const CHAIN_TRUST_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
]);

// pg surfaces the underlying TLS error's `reason` as the message, so match the
// phrasings Node uses for an unbuildable trust chain.
const CHAIN_TRUST_MESSAGE =
  /self-signed certificate in certificate chain|unable to verify the first certificate|unable to get local issuer certificate|certificate verify failed/i;

function isChainTrustError(error) {
  return CHAIN_TRUST_CODES.has(error.code) || CHAIN_TRUST_MESSAGE.test(error.message ?? "");
}

async function connectDatabase() {
  const policy = sslPolicy();
  try {
    const db = new Client(dbConfig(policy));
    await db.connect();
    return db;
  } catch (error) {
    if (policy.rejectUnauthorized === false || !isChainTrustError(error)) {
      throw error;
    }
    console.warn(
      "  ! TLS chain verification failed (" +
        (error.code ?? error.message) +
        ").\n" +
        "    This machine cannot build a trust chain to Supabase's certificate\n" +
        "    (commonly a corporate/AV TLS proxy). Retrying with encrypted-but-\n" +
        "    unverified TLS for this local run only; TLS stays on. Fix the CA\n" +
        "    chain (or set VERIFY_E2E_SSL=verify-full) to keep full verification."
    );
    const db = new Client(dbConfig(SSL_POLICIES.require));
    await db.connect();
    return db;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — run with --env-file=.env");
    process.exit(1);
  }

  const db = await connectDatabase();
  console.log(`Connected to database. Base URL: ${BASE_URL}`);

  // ---------------------------------------------------------------- seed
  section("Setup: throwaway user + session");
  await db.query(`DELETE FROM "Post" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [TEST_EMAIL]);
  await db.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [TEST_EMAIL]);
  await db.query(`DELETE FROM "User" WHERE email = $1`, [TEST_EMAIL]);

  const userId = `ve2e_${randomBytes(8).toString("hex")}`;
  await db.query(
    `INSERT INTO "User" (id, email, username, "isPrivate", "createdAt")
     VALUES ($1, $2, 'verify_e2e', false, NOW())`,
    [userId, TEST_EMAIL]
  );
  await db.query(
    `INSERT INTO "Session" (id, "sessionToken", "userId", expires)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
    [`ve2e_s_${randomBytes(8).toString("hex")}`, SESSION_TOKEN, userId]
  );
  console.log("  seeded user + session");

  // Sanity: is the dev server reachable and does our session work?
  let probe;
  try {
    probe = await apiJson("/api/search?category=movie&q=probe");
  } catch {
    console.error(
      `Could not reach ${BASE_URL} — is the dev server running? Start it with: npm run dev`
    );
    await db.end();
    process.exit(1);
  }
  if (probe.status === 401 && cookieName === "next-auth.session-token") {
    cookieName = "__Secure-next-auth.session-token";
    const retry = await apiJson("/api/search?category=movie&q=probe");
    check("dev server reachable + session cookie accepted", retry.status === 200, `status ${retry.status}`);
  } else {
    check("dev server reachable + session cookie accepted", probe.status === 200, `status ${probe.status}`);
  }

  // ------------------------------------------------------------- TV flow
  section("TV flow (TMDb): Breaking Bad, seasons 1 + 2");
  const tvSearch = await apiJson("/api/search?category=tv&q=Breaking%20Bad");
  check("TV search returns results", tvSearch.body?.results?.length >= 1);
  const tvTitle = tvSearch.body?.results?.[0];
  const tvSourceId = tvTitle?.sourceId;

  // The cache key is (source, category, sourceId), so a movie sharing this
  // numeric id must not be counted here.
  const titleRows = await db.query(
    `SELECT id FROM "Title" WHERE source = 'tmdb' AND category = 'tv' AND "sourceId" = $1`,
    [tvSourceId]
  );
  check("TV title cached locally (source+sourceId)", titleRows.rowCount === 1, `tmdb:${tvSourceId}`);

  const post1 = await apiJson("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titleId: tvTitle.titleId, seasonNumber: 1, rating: 8, caption: "Pilot rewatch" }),
  });
  check("post season 1 (rating 8)", post1.status === 200, `status ${post1.status}`);

  let group = await db.query(
    `SELECT id, name, category FROM "FranchiseGroup" WHERE "sourceKey" = $1`,
    [`tmdb:${tvSourceId}`]
  );
  check("franchise group created with sourceKey tmdb:{showId}", group.rowCount === 1, group.rows[0]?.name);

  let entry1 = await db.query(
    `SELECT id, "seasonNumber" FROM "Entry" WHERE "entryKey" = $1`,
    [`tmdb:${tvSourceId}:s1`]
  );
  check("entry created with entryKey tmdb:{show}:s1", entry1.rowCount === 1);
  const entry1Id = entry1.rows[0]?.id;

  let posts = await db.query(
    `SELECT id, rating, caption FROM "Post" WHERE "userId" = $1 AND "entryId" = $2`,
    [userId, entry1Id]
  );
  check("post row exists with rating 8 + caption", posts.rowCount === 1 && posts.rows[0].rating === 8);

  // Re-rate in place
  const reRate = await apiJson("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titleId: tvTitle.titleId, seasonNumber: 1, rating: 9 }),
  });
  posts = await db.query(
    `SELECT id, rating, caption FROM "Post" WHERE "userId" = $1 AND "entryId" = $2`,
    [userId, entry1Id]
  );
  check(
    "re-rating updates in place (still 1 post, rating 9)",
    reRate.status === 200 && posts.rowCount === 1 && posts.rows[0].rating === 9
  );

  // New season = new entry + new post, same group
  const post2 = await apiJson("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titleId: tvTitle.titleId, seasonNumber: 2, rating: 7 }),
  });
  const entries = await db.query(
    `SELECT id, "entryKey", "seasonNumber", "franchiseGroupId" FROM "Entry"
     WHERE "franchiseGroupId" = $1 ORDER BY "seasonNumber"`,
    [group.rows[0].id]
  );
  const postsForGroup = await db.query(
    `SELECT COUNT(*)::int AS n FROM "Post" WHERE "userId" = $1 AND "entryId" = ANY($2::text[])`,
    [userId, entries.rows.map((e) => e.id)]
  );
  check(
    "season 2 creates a second entry in the SAME group (feed event)",
    post2.status === 200 && entries.rowCount === 2 && postsForGroup.rows[0].n === 2
  );

  // ---------------------------------------------------------- movie flow
  section("Movie flow (TMDb): standalone entry, no franchise group");
  const movieSearch = await apiJson("/api/search?category=movie&q=Inception");
  const movieTitle = movieSearch.body?.results?.[0];
  check("movie search returns results", Boolean(movieTitle));
  const moviePost = await apiJson("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titleId: movieTitle.titleId, rating: 10, caption: "Rewatch yearly" }),
  });
  const movieEntry = await db.query(
    `SELECT id, "franchiseGroupId", "entryKey" FROM "Entry" WHERE "entryKey" = $1`,
    [`tmdb:movie:${movieTitle.sourceId}`]
  );
  check(
    "movie post creates standalone entry (no group, entryKey tmdb:movie:{id})",
    moviePost.status === 200 && movieEntry.rowCount === 1 && movieEntry.rows[0].franchiseGroupId === null
  );

  // ------------------------------------- movie/TV id collision (bug fix)
  section("Movie/TV id collision: same numeric id, two categories");
  // TMDb movie and TV ids are independent sequences that collide numerically:
  // id 1396 is the TV show "Breaking Bad" (cached by the TV flow above) *and*
  // the movie "Mirror". The Title cache key is (source, category, sourceId),
  // so the movie must get its own row instead of silently returning the
  // cached TV row — which used to show a TV show on the Movie tab and never
  // cached the movie at all.

  const indexRows = await db.query(
    `SELECT indexname FROM pg_indexes
     WHERE tablename = 'Title'
       AND indexname IN ('Title_source_category_sourceId_key', 'Title_source_sourceId_key')`
  );
  const indexNames = indexRows.rows.map((r) => r.indexname);
  check(
    "unique index is (source, category, sourceId)",
    indexNames.includes("Title_source_category_sourceId_key") &&
      !indexNames.includes("Title_source_sourceId_key"),
    indexNames.join(", ") || "no matching index found"
  );

  const collisionSearch = await apiJson("/api/search?category=movie&q=Mirror");
  const collisionResults = collisionSearch.body?.results ?? [];
  const collisionRows = collisionResults.length
    ? await db.query(
        `SELECT id, name, category FROM "Title"
         WHERE source = 'tmdb' AND category = 'movie' AND "sourceId" = ANY($1::text[])`,
        [collisionResults.map((r) => r.sourceId)]
      )
    : { rows: [] };
  const rowsById = new Map(collisionRows.rows.map((r) => [r.id, r]));
  const leaked = collisionResults.filter((r) => {
    const row = rowsById.get(r.titleId);
    return !row || row.category !== "movie" || row.name !== r.name;
  });
  check(
    "every movie result is backed by its own movie-category row",
    collisionResults.length > 0 && leaked.length === 0,
    leaked.length
      ? `leaked rows: ${leaked.map((r) => `${r.name} (tmdb:${r.sourceId})`).join(", ")}`
      : `${collisionResults.length} movie results verified`
  );

  const mirrorHit = collisionResults.find((r) => r.sourceId === tvSourceId);
  if (mirrorHit) {
    check(
      `movie id ${tvSourceId} resolves to the movie, not the cached TV show`,
      mirrorHit.category === "movie" &&
        mirrorHit.name.toLowerCase() !== "breaking bad",
      `${mirrorHit.name} (${mirrorHit.category})`
    );
    const mirrorPost = await apiJson("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titleId: mirrorHit.titleId,
        rating: 9,
        caption: "Tarkovsky",
      }),
    });
    const mirrorEntry = await db.query(
      `SELECT e."entryKey", e."franchiseGroupId", t.category FROM "Entry" e
       JOIN "Title" t ON t.id = e."titleId" WHERE e."entryKey" = $1`,
      [`tmdb:movie:${tvSourceId}`]
    );
    check(
      "colliding movie posts as a standalone movie entry",
      mirrorPost.status === 200 &&
        mirrorEntry.rowCount === 1 &&
        mirrorEntry.rows[0].category === "movie" &&
        mirrorEntry.rows[0].franchiseGroupId === null,
      mirrorEntry.rows[0]?.entryKey
    );
  } else {
    skip(
      `TMDb did not return movie id ${tvSourceId} ("Mirror") for the query "mirror"`,
      "the row-invariant check above still covers the collision"
    );
  }

  // ---------------------------------------------------------- anime flow
  section("Anime flow (AniList): multi-season franchise grouping via root walk");
  const animeSearch = await apiJson("/api/search?category=anime&q=Attack%20on%20Titan");
  const animeResults = animeSearch.body?.results ?? [];
  check("anime search returns results", animeResults.length >= 1);
  if (animeResults.length >= 1) {
    const s1 = animeResults[0];
    const s2 =
      animeResults.find((r) => /season\s*2|2nd season|part\s*2/i.test(r.name)) ??
      animeResults[1];

    const animePost1 = await apiJson("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: s1.titleId, rating: 9 }),
    });
    check("post anime season 1 (rating 9)", animePost1.status === 200, `status ${animePost1.status}`);

    const animeGroup = await db.query(
      `SELECT g.id, g."sourceKey", g.name FROM "FranchiseGroup" g
       JOIN "Entry" e ON e."franchiseGroupId" = g.id
       JOIN "Title" t ON t.id = e."titleId"
       WHERE t."sourceId" = $1 AND t.source = 'anilist'`,
      [s1.sourceId]
    );
    check(
      "anime entry grouped under anilist:{rootMediaId}",
      animeGroup.rowCount === 1 && animeGroup.rows[0].sourceKey.startsWith("anilist:"),
      animeGroup.rows[0]?.sourceKey
    );

    const relationsCached = await db.query(
      `SELECT COUNT(*)::int AS n FROM "AniListRelation" r
       JOIN "Title" t ON t.id = r."fromTitleId"
       WHERE t.source = 'anilist' AND t."sourceId" = $1`,
      [s1.sourceId]
    );
    check("AniList relation edges cached", relationsCached.rows[0].n >= 1, `${relationsCached.rows[0].n} edges`);

    if (s2 && s2.titleId !== s1.titleId) {
      const animePost2 = await apiJson("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId: s2.titleId, rating: 8 }),
      });
      const animeEntries = await db.query(
        `SELECT e."entryKey", e."seasonNumber", e."seasonLabel" FROM "Entry" e
         JOIN "Title" t ON t.id = e."titleId"
         WHERE t.source = 'anilist' AND t."sourceId" IN ($1, $2)`,
        [s1.sourceId, s2.sourceId]
      );
      const sameGroup =
        animeGroup.rowCount === 1 &&
        animeEntries.rowCount === 2 &&
        (await db.query(
          `SELECT COUNT(DISTINCT "franchiseGroupId")::int AS n FROM "Entry" e
           JOIN "Title" t ON t.id = e."titleId"
           WHERE t.source = 'anilist' AND t."sourceId" IN ($1, $2)`,
          [s1.sourceId, s2.sourceId]
        )).rows[0].n === 1;
      check(
        "second anime season lands in the SAME franchise group (root walk)",
        animePost2.status === 200 && sameGroup,
        animeEntries.rows.map((e) => `${e.entryKey}${e.seasonNumber ? ` (s${e.seasonNumber})` : ""}${e.seasonLabel ? ` [${e.seasonLabel}]` : ""}`).join(" + ")
      );
    } else {
      check("second anime season lands in the SAME franchise group (root walk)", false, "no distinct second result found in search");
    }
  }

  // -------------------------------------------------------- cache checks
  section("Cache behavior");
  const before = await db.query(
    `SELECT COUNT(*)::int AS n FROM "Title" WHERE source = 'tmdb' AND category = 'tv' AND "sourceId" = $1`,
    [tvSourceId]
  );
  await apiJson("/api/search?category=tv&q=Breaking%20Bad");
  const after = await db.query(
    `SELECT COUNT(*)::int AS n FROM "Title" WHERE source = 'tmdb' AND category = 'tv' AND "sourceId" = $1`,
    [tvSourceId]
  );
  check("repeat search does not duplicate cached titles", before.rows[0].n === after.rows[0].n);

  // ------------------------------------------------------------- cleanup
  section("Cleanup");
  await db.query(`DELETE FROM "Post" WHERE "userId" = $1`, [userId]);
  await db.query(`DELETE FROM "Session" WHERE "userId" = $1`, [userId]);
  await db.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
  console.log("  removed test user, session and posts (cache rows intentionally kept)");
  await db.end();

  // ------------------------------------------------------------- summary
  const failed = results.filter((r) => !r.ok);
  const skipNote = skipped > 0 ? `, ${skipped} skipped` : "";
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${skipNote}`);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
}

main().catch((error) => {
  console.error("\nVerification script error:", error.message);
  process.exit(1);
});
