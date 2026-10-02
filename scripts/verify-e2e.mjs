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

/** `options.sessionToken` overrides which user is making the call — the
 *  friends checks need three separate identities talking to each other. */
async function api(path, options = {}) {
  const { sessionToken = SESSION_TOKEN, ...rest } = options;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      Cookie: `${cookieName}=${sessionToken}`,
      ...(rest.headers ?? {}),
    },
  });
  return res;
}

/** JSON helper for the write routes. */
function jsonPost(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function apiJson(path, options) {
  const res = await api(path, options);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Search the API and return a human-readable note about how the call went.
 *  An empty result set must never be indistinguishable from a silent failure,
 *  so the status and the route's `degraded` message are always surfaced. */
async function searchApi(category, query) {
  const { status, body } = await apiJson(
    `/api/search?category=${category}&q=${encodeURIComponent(query)}`
  );
  const degraded = body?.degraded ? `, degraded: ${body.degraded}` : "";
  return { status, body, note: `status ${status}${degraded}` };
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

/** Creates a throwaway user + session row directly in the DB, so the API
 *  routes can be exercised without a Google login. Pass an explicit `token`
 *  when the caller needs to know the cookie in advance — the primary user must
 *  be seeded with SESSION_TOKEN, because that is the cookie every request
 *  sends. (Generating a token here instead once made every authed call 401 and
 *  looked exactly like an app-wide auth regression.) */
async function seedUser(db, email, username, token) {
  const id = `ve2e_${randomBytes(8).toString("hex")}`;
  const sessionToken =
    token ?? `verify-e2e-${randomBytes(16).toString("hex")}`;
  await db.query(
    `INSERT INTO "User" (id, email, username, "isPrivate", "createdAt")
     VALUES ($1, $2, $3, false, NOW())`,
    [id, email, username]
  );
  await db.query(
    `INSERT INTO "Session" (id, "sessionToken", "userId", expires)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')`,
    [`ve2e_s_${randomBytes(8).toString("hex")}`, sessionToken, id]
  );
  return { id, token: sessionToken, username, email };
}

/** Removes the throwaway users and everything hanging off them. A function so
 *  the early-exit paths can clean up too, instead of leaking test users. */
async function cleanup(db, users) {
  for (const u of users) {
    await db.query(`DELETE FROM "Friendship" WHERE "requesterId" = $1 OR "recipientId" = $1`, [u.id]);
    await db.query(`DELETE FROM "Post" WHERE "userId" = $1`, [u.id]);
    await db.query(`DELETE FROM "Session" WHERE "userId" = $1`, [u.id]);
    await db.query(`DELETE FROM "User" WHERE id = $1`, [u.id]);
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
  section("Setup: throwaway users + sessions");
  // One primary user (A) for the content flows, plus two more (B, C) so the
  // friends checks have real counterparties.
  const TEST_EMAILS = [TEST_EMAIL, "verify-e2e-b@local.test", "verify-e2e-c@local.test"];
  for (const email of TEST_EMAILS) {
    await db.query(`DELETE FROM "Friendship" WHERE "requesterId" IN (SELECT id FROM "User" WHERE email = $1) OR "recipientId" IN (SELECT id FROM "User" WHERE email = $1)`, [email]);
    await db.query(`DELETE FROM "Post" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [email]);
    await db.query(`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email = $1)`, [email]);
    await db.query(`DELETE FROM "User" WHERE email = $1`, [email]);
  }

  // `userId` below is A; SESSION_TOKEN is A's cookie, so every pre-existing
  // check keeps working unchanged.
  // A gets SESSION_TOKEN: that is the cookie `api()` sends by default.
  const A = await seedUser(db, TEST_EMAIL, "verify_e2e", SESSION_TOKEN);
  const userId = A.id;
  const B = await seedUser(db, TEST_EMAILS[1], "friend_b");
  const C = await seedUser(db, TEST_EMAILS[2], "friend_c");
  console.log(`  seeded users: ${A.username}, ${B.username}, ${C.username}`);

  // Prove the cookie this harness sends actually resolves to a session row.
  // Without this, a token mismatch surfaces as 401s on every authed call and
  // reads as an app-wide auth regression rather than a seeding mistake.
  const sessionProbe = await db.query(
    `SELECT u.username FROM "Session" s JOIN "User" u ON u.id = s."userId"
     WHERE s."sessionToken" = $1 AND s.expires > NOW()`,
    [SESSION_TOKEN]
  );
  check(
    "the cookie this harness sends resolves to an unexpired session",
    sessionProbe.rows.length === 1,
    sessionProbe.rows[0]?.username ??
      `no row for token ${SESSION_TOKEN.slice(0, 22)}…`
  );

  // Sanity: is the dev server reachable and does our session work? A failure
  // here cascades into every later check (and once produced a crash three
  // sections later), so diagnose it here and stop.
  let probe;
  try {
    probe = await apiJson("/api/search?category=movie&q=probe");
  } catch {
    console.error(
      `\nCould not reach ${BASE_URL} — is the dev server running? Start it with: npm run dev`
    );
    await cleanup(db, [A, B, C]);
    await db.end();
    process.exit(1);
  }

  if (probe.status === 401 && cookieName === "next-auth.session-token") {
    cookieName = "__Secure-next-auth.session-token";
    probe = await apiJson("/api/search?category=movie&q=probe");
  }

  check("dev server reachable + session cookie accepted", probe.status === 200, `status ${probe.status}`);

  if (probe.status !== 200) {
    console.error(
      `\nThe dev server rejected the harness session cookie (status ${probe.status}).\n` +
        "Nothing after this point is meaningful. Most likely causes, in order:\n" +
        "  1. The seeded Session row does not match the cookie — see the setup check above.\n" +
        "  2. NEXTAUTH_SECRET in .env is not the secret the running dev server loaded\n" +
        "     (restart `npm run dev` after editing .env).\n" +
        `  3. NEXTAUTH_URL in .env does not match ${BASE_URL}.`
    );
    await cleanup(db, [A, B, C]);
    await db.end();
    process.exit(1);
  }

  // ------------------------------------------------- schema: friends indexes
  // Migration 20261001090000_friends_feed_indexes must be applied, or the feed
  // and friend-list queries fall back to scans.
  section("Schema: friends/feed indexes");
  const friendsFeedIndexRows = await db.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('Post', 'Friendship')`
  );
  const friendsFeedIndexNames = friendsFeedIndexRows.rows.map((r) => r.indexname);
  check("Post_userId_createdAt_idx exists", friendsFeedIndexNames.includes("Post_userId_createdAt_idx"));
  check("old Post_userId_idx is gone", !friendsFeedIndexNames.includes("Post_userId_idx"));
  check("Friendship_requesterId_status_idx exists", friendsFeedIndexNames.includes("Friendship_requesterId_status_idx"));
  check("Friendship_recipientId_status_idx exists", friendsFeedIndexNames.includes("Friendship_recipientId_status_idx"));
  check("directional unique key kept", friendsFeedIndexNames.includes("Friendship_requesterId_recipientId_key"));

  // ------------------------------------------------------------- TV flow
  section("TV flow (TMDb): Breaking Bad, seasons 1 + 2");
  const tvSearch = await searchApi("tv", "Breaking Bad");
  check(
    "TV search returns results",
    tvSearch.status === 200 && (tvSearch.body?.results?.length ?? 0) >= 1,
    tvSearch.note
  );
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
  const movieSearch = await searchApi("movie", "Inception");
  const movieTitle = movieSearch.body?.results?.[0];
  check(
    "movie search returns results",
    movieSearch.status === 200 && Boolean(movieTitle),
    movieSearch.note
  );
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

  // (1) Deterministic, TMDb-independent proof: a movie row for the same
  // numeric id as the cached TV row must be insertable. The old
  // (source, sourceId) key rejected it with a unique violation, which is why
  // the movie was never cached. If the movie is already cached, its mere
  // existence alongside the TV row proves the same thing.
  const existingMovie = await db.query(
    `SELECT id FROM "Title" WHERE source = 'tmdb' AND category = 'movie' AND "sourceId" = $1`,
    [tvSourceId]
  );
  let probeId = null;
  let insertError = "";
  if (existingMovie.rowCount === 0) {
    probeId = `ve2e_${randomBytes(6).toString("hex")}`;
    try {
      await db.query(
        `INSERT INTO "Title" (id, name, category, "posterUrl", source, "sourceId", "createdAt")
         VALUES ($1, 'verify-e2e collision probe', 'movie', NULL, 'tmdb', $2, NOW())`,
        [probeId, tvSourceId]
      );
    } catch (error) {
      insertError = error instanceof Error ? error.message : String(error);
    }
  }
  try {
    const both = await db.query(
      `SELECT category, name FROM "Title" WHERE source = 'tmdb' AND "sourceId" = $1 ORDER BY category`,
      [tvSourceId]
    );
    check(
      `movie + TV rows coexist for tmdb:${tvSourceId}`,
      insertError === "" &&
        both.rowCount === 2 &&
        both.rows.some((r) => r.category === "movie"),
      insertError || both.rows.map((r) => `${r.category}:${r.name}`).join(" + ")
    );
  } finally {
    if (probeId) {
      await db.query(`DELETE FROM "Title" WHERE id = $1`, [probeId]);
    }
  }

  // (2) App-level invariant on real search results. Deliberately uses the same
  // query as the movie flow above, which is known to return hits, so this
  // check always has rows to verify.
  const inceptionSearch = await searchApi("movie", "Inception");
  const movieResults = inceptionSearch.body?.results ?? [];
  check(
    "movie search returns results (for the invariant check)",
    inceptionSearch.status === 200 && movieResults.length > 0,
    inceptionSearch.note
  );
  const movieRows = movieResults.length
    ? await db.query(
        `SELECT id, name, category FROM "Title"
         WHERE source = 'tmdb' AND category = 'movie' AND "sourceId" = ANY($1::text[])`,
        [movieResults.map((r) => r.sourceId)]
      )
    : { rows: [] };
  const rowsById = new Map(movieRows.rows.map((r) => [r.id, r]));
  const leaked = movieResults.filter((r) => {
    const row = rowsById.get(r.titleId);
    return !row || row.category !== "movie" || row.name !== r.name;
  });
  check(
    "every movie result is backed by its own movie-category row",
    movieResults.length > 0 && leaked.length === 0,
    leaked.length
      ? `leaked: ${leaked.map((r) => `${r.name} (tmdb:${r.sourceId})`).join(", ")}`
      : `${movieResults.length} results verified`
  );

  // (3) Targeted probe: does TMDb surface the colliding movie for "mirror"?
  // Inconclusive without a failure — the note says exactly what came back.
  const collisionSearch = await searchApi("movie", "Mirror");
  const collisionResults = collisionSearch.body?.results ?? [];
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
      `${collisionSearch.note}; checks 1 and 2 above still cover the collision`
    );
  }

  // ---------------------------------------------------------- anime flow
  section("Anime flow (AniList): PREQUEL-chain grouping via root walk");
  const animeSearch = await searchApi("anime", "Attack on Titan");
  const animeResults = animeSearch.body?.results ?? [];
  check(
    "anime search returns results",
    animeSearch.status === 200 && animeResults.length >= 1,
    animeSearch.note
  );
  if (animeResults.length >= 1) {
    // Pick a genuine PREQUEL-linked pair from the cached relation edges.
    // Do NOT trust AniList's result ordering or the result names: for
    // "Attack on Titan" the top hit is the OVA (anilist:18397), whose only
    // edges are SOURCE/PARENT — under the approved PREQUEL-walk design it is
    // its own chain root, so it can never share a group with Season 2
    // (anilist:20958, whose PREQUEL is Season 1, anilist:16498).
    const edgeRows = await db.query(
      `SELECT from_t."sourceId" AS from_id, r."toSourceId" AS to_id, r."relationType" AS type
       FROM "AniListRelation" r
       JOIN "Title" from_t ON from_t.id = r."fromTitleId"
       WHERE from_t.source = 'anilist' AND from_t."sourceId" = ANY($1::text[])`,
      [animeResults.map((r) => r.sourceId)]
    );
    const byId = new Map(animeResults.map((r) => [r.sourceId, r]));
    const pair = edgeRows.rows
      .filter((e) => e.type === "PREQUEL" && byId.has(e.to_id))
      .map((e) => ({ parent: byId.get(e.to_id), child: byId.get(e.from_id) }))[0];

    if (!pair) {
      skip(
        "no PREQUEL-linked pair among the anime search results",
        "the root walk cannot be exercised with this result set"
      );
    } else {
      const s1 = pair.parent; // earlier in the PREQUEL chain
      const s2 = pair.child; // has PREQUEL → s1

      const animePost1 = await apiJson("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId: s1.titleId, rating: 9 }),
      });
      check(
        "post the earlier entry in the chain (rating 9)",
        animePost1.status === 200,
        `status ${animePost1.status}`
      );

      const relationsCached = await db.query(
        `SELECT COUNT(*)::int AS n FROM "AniListRelation" r
         JOIN "Title" t ON t.id = r."fromTitleId"
         WHERE t.source = 'anilist' AND t."sourceId" = $1`,
        [s1.sourceId]
      );
      check(
        "AniList relation edges cached",
        relationsCached.rows[0].n >= 1,
        `${relationsCached.rows[0].n} edges`
      );

      const animePost2 = await apiJson("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId: s2.titleId, rating: 8 }),
      });

      const animeEntries = await db.query(
        `SELECT e."entryKey", e."franchiseGroupId", t."sourceId", t.name FROM "Entry" e
         JOIN "Title" t ON t.id = e."titleId"
         WHERE t.source = 'anilist' AND t."sourceId" IN ($1, $2)`,
        [s1.sourceId, s2.sourceId]
      );
      const groupIds = [
        ...new Set(animeEntries.rows.map((e) => e.franchiseGroupId)),
      ];
      check(
        `anilist:${s2.sourceId} (PREQUEL → anilist:${s1.sourceId}) lands in the SAME group`,
        animePost2.status === 200 &&
          animeEntries.rowCount === 2 &&
          groupIds.length === 1 &&
          groupIds[0] !== null,
        `${s1.name} + ${s2.name} → ${groupIds.length} group(s)`
      );

      // The shared group must be keyed on a real PREQUEL ancestor of the later
      // entry (the walk's root), not on either entry itself — unless that
      // entry genuinely is the chain root.
      const ancestors = await db.query(
        `WITH RECURSIVE chain AS (
           SELECT r."toSourceId" AS id FROM "AniListRelation" r
             JOIN "Title" t ON t.id = r."fromTitleId"
            WHERE t.source = 'anilist' AND t."sourceId" = $1
              AND r."relationType" = 'PREQUEL'
           UNION
           SELECT r."toSourceId" FROM "AniListRelation" r
             JOIN "Title" t ON t.id = r."fromTitleId"
             JOIN chain c ON t."sourceId" = c.id
            WHERE t.source = 'anilist' AND r."relationType" = 'PREQUEL'
         )
         SELECT id FROM chain`,
        [s2.sourceId]
      );
      const ancestorIds = new Set(ancestors.rows.map((r) => r.id));
      const group =
        groupIds[0] !== null
          ? (
              await db.query(
                `SELECT "sourceKey", name FROM "FranchiseGroup" WHERE id = $1`,
                [groupIds[0]]
              )
            ).rows[0]
          : null;
      const rootId = group?.sourceKey?.replace(/^anilist:/, "");
      check(
        "group is keyed on a PREQUEL-chain ancestor of the later entry",
        Boolean(rootId) && (ancestorIds.has(rootId) || rootId === s2.sourceId),
        `${group?.sourceKey} (${group?.name}); ancestors: ${
          [...ancestorIds].join(", ") || "none"
        }`
      );
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

  // -------------------------------------------------------------- friends
  section("Friends: requests, accept, decline, cancel, unfriend");

  /** Every row between two users, in either direction. */
  async function friendshipRows(x, y) {
    return db.query(
      `SELECT id, "requesterId", "recipientId", status FROM "Friendship"
       WHERE ("requesterId" = $1 AND "recipientId" = $2)
          OR ("requesterId" = $2 AND "recipientId" = $1)
       ORDER BY status`,
      [x, y]
    );
  }

  const sendAB = await apiJson("/api/friends/requests", jsonPost({ username: B.username }));
  check(
    "A sends B a request by username",
    sendAB.status === 201 && sendAB.body?.status === "pending",
    `status ${sendAB.status} ${JSON.stringify(sendAB.body)}`
  );

  const dupAB = await apiJson("/api/friends/requests", jsonPost({ username: B.username }));
  check(
    "duplicate request is rejected",
    dupAB.status === 409 && dupAB.body?.code === "already_requested",
    `status ${dupAB.status} code ${dupAB.body?.code}`
  );

  const selfSend = await apiJson("/api/friends/requests", jsonPost({ username: A.username }));
  check(
    "self-request is rejected",
    selfSend.status === 400 && selfSend.body?.code === "self",
    `status ${selfSend.status} code ${selfSend.body?.code}`
  );

  const unknownSend = await apiJson(
    "/api/friends/requests",
    jsonPost({ username: "definitely_not_a_real_user_xyz" })
  );
  check("unknown username is 404", unknownSend.status === 404, `status ${unknownSend.status}`);

  const anon = await apiJson("/api/friends", { sessionToken: "not-a-real-session-token" });
  check("unauthenticated call is 401", anon.status === 401, `status ${anon.status}`);

  const pendingAB = await friendshipRows(A.id, B.id);
  check(
    "exactly one pending row, with A as requester",
    pendingAB.rows.length === 1 &&
      pendingAB.rows[0].status === "pending" &&
      pendingAB.rows[0].requesterId === A.id,
    `${pendingAB.rows.length} rows, status ${pendingAB.rows[0]?.status}`
  );

  const bIncoming = await apiJson("/api/friends", { sessionToken: B.token });
  const incoming = bIncoming.body?.incoming ?? [];
  const incomingId = incoming.find((r) => r.person.userId === A.id)?.friendshipId;
  check("B sees the request as incoming", Boolean(incomingId), `${incoming.length} incoming`);

  const accepted = await apiJson(`/api/friends/requests/${incomingId}/accept`, {
    method: "POST",
    sessionToken: B.token,
  });
  check("B accepts the request", accepted.status === 200, `status ${accepted.status}`);

  const acceptedAB = await friendshipRows(A.id, B.id);
  check(
    "row flips to accepted, no second row created",
    acceptedAB.rows.length === 1 && acceptedAB.rows[0].status === "accepted",
    `${acceptedAB.rows.length} rows, status ${acceptedAB.rows[0]?.status}`
  );

  const aAfter = await apiJson("/api/friends");
  check(
    "A lists B as a friend",
    (aAfter.body?.friends ?? []).some((f) => f.userId === B.id),
    `${aAfter.body?.friends?.length ?? 0} friends`
  );
  const bAfter = await apiJson("/api/friends", { sessionToken: B.token });
  check(
    "B lists A as a friend",
    (bAfter.body?.friends ?? []).some((f) => f.userId === A.id)
  );
  check(
    "accepted request leaves the incoming list",
    (bAfter.body?.incoming ?? []).length === 0,
    `${bAfter.body?.incoming?.length ?? 0} incoming`
  );

  const acceptAgain = await apiJson(`/api/friends/requests/${incomingId}/accept`, {
    method: "POST",
    sessionToken: B.token,
  });
  check("accepting twice is idempotent", acceptAgain.status === 200, `status ${acceptAgain.status}`);

  // Reverse pending request -> auto-accept (approved behaviour, journey §13 Q5)
  await apiJson("/api/friends/requests", jsonPost({ username: C.username }));
  const cToA = await apiJson("/api/friends/requests", {
    ...jsonPost({ username: A.username }),
    sessionToken: C.token,
  });
  check(
    "reverse pending request auto-accepts",
    cToA.status === 200 && cToA.body?.status === "accepted",
    `status ${cToA.status} ${JSON.stringify(cToA.body)}`
  );
  const acRows = await friendshipRows(A.id, C.id);
  check(
    "auto-accept leaves exactly one row",
    acRows.rows.length === 1 && acRows.rows[0].status === "accepted",
    `${acRows.rows.length} rows`
  );

  // Only the recipient may accept.
  await apiJson("/api/friends/requests", {
    ...jsonPost({ username: C.username }),
    sessionToken: B.token,
  });
  const bcRows = await friendshipRows(B.id, C.id);
  const bcId = bcRows.rows[0]?.id;
  const wrongAccept = await apiJson(`/api/friends/requests/${bcId}/accept`, {
    method: "POST",
    sessionToken: B.token,
  });
  check(
    "requester cannot accept their own request",
    wrongAccept.status === 403 && wrongAccept.body?.code === "forbidden",
    `status ${wrongAccept.status} code ${wrongAccept.body?.code}`
  );

  const declined = await apiJson(`/api/friends/${bcId}`, {
    method: "DELETE",
    sessionToken: C.token,
  });
  check(
    "C declines B's request",
    declined.status === 200 && declined.body?.action === "declined",
    `status ${declined.status} action ${declined.body?.action}`
  );
  const bcGone = await friendshipRows(B.id, C.id);
  check(
    "declining deletes the row (no rejected status)",
    bcGone.rows.length === 0,
    `${bcGone.rows.length} rows`
  );

  const abId = (await friendshipRows(A.id, B.id)).rows[0]?.id;
  const unfriended = await apiJson(`/api/friends/${abId}`, { method: "DELETE" });
  check(
    "A unfriends B",
    unfriended.status === 200 && unfriended.body?.action === "unfriended",
    `status ${unfriended.status} action ${unfriended.body?.action}`
  );
  const abGone = await friendshipRows(A.id, B.id);
  check("unfriending deletes the row", abGone.rows.length === 0, `${abGone.rows.length} rows`);

  const resent = await apiJson("/api/friends/requests", jsonPost({ username: B.username }));
  const cancelled = await apiJson(`/api/friends/${resent.body?.friendshipId}`, {
    method: "DELETE",
  });
  check(
    "A cancels their own pending request",
    cancelled.status === 200 && cancelled.body?.action === "cancelled",
    `status ${cancelled.status} action ${cancelled.body?.action}`
  );

  section("Friends: discovery is username-only");
  const byHandle = await apiJson("/api/users/search?q=friend_");
  const found = (byHandle.body?.results ?? []).map((r) => r.username);
  check(
    "username search finds B and C",
    found.includes("friend_b") && found.includes("friend_c"),
    found.join(", ")
  );
  check("username search excludes the searcher", !found.includes("verify_e2e"));

  const shortQuery = await apiJson("/api/users/search?q=f");
  check(
    "queries under 2 characters return nothing",
    (shortQuery.body?.results ?? []).length === 0
  );

  const upperQuery = await apiJson("/api/users/search?q=FRIEND_B");
  check(
    "username search is case-insensitive",
    (upperQuery.body?.results ?? []).some((r) => r.username === "friend_b")
  );

  const byEmail = await apiJson(
    `/api/users/search?q=${encodeURIComponent(B.email)}`
  );
  check(
    "email addresses are not searchable (no enumeration surface)",
    (byEmail.body?.results ?? []).length === 0,
    (byEmail.body?.results ?? []).map((r) => r.username).join(", ")
  );

  // ------------------------------------------------------------- cleanup
  section("Cleanup");
  await cleanup(db, [A, B, C]);
  console.log("  removed test users, sessions and posts (cache rows intentionally kept)");
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
