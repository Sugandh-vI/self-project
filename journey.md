# Journey Log

This file is a running log of implementation progress on this project. It exists so that any
coding session — including a brand new one with no prior chat history — can read this file
and immediately understand what has been built, what decisions were made along the way, and
what should happen next.

**Rule for every session:** read this file first, before writing any code. At the end of the
session (or after any meaningful chunk of work), append a new dated entry below — do not
delete or rewrite older entries. Treat this as an append-only log.

Each entry should cover:
- What was worked on this session
- What was completed
- Any decisions made or changed during implementation (and why)
- Any known issues, blockers, or things left half-done
- What should happen next

---

## [Date: 26/09/2026] — Project initialized

- Repository created: `self-project`.
- `README.md` written, covering full product proposal, feature decisions, and tech stack.
- No code written yet.
- Next step: scaffold the Next.js project with the agreed stack (TypeScript, Tailwind,
  shadcn/ui, Prisma + Supabase Postgres, NextAuth with Google provider) and set up the initial
  Prisma schema based on the data model in README.md Section 11.

---

## [Date: 26/09/2026] — Scaffold + initial Prisma schema (awaiting schema approval)

### What was worked on
- Scaffolded the project per README Section 10 and wrote the initial Prisma schema per
  Section 11. **Stopped at the mandatory checkpoint: schema posted for user approval, no
  features/pages/logic built yet.**

### What was completed
- **Next.js 16.3.6** (App Router, React 19.2.8, TypeScript, Tailwind CSS v4, ESLint 9 flat
  config) via `create-next-app`.
- **shadcn/ui config** hand-written: `components.json` (new-york style, neutral base),
  `lib/utils.ts` (`cn` helper), `app/globals.css` rewritten to the shadcn Tailwind v4 theme
  (light + dark, oklch). No UI components added yet — registry unreachable from this sandbox
  (see blockers). `npx shadcn add ...` will work once `ui.shadcn.com` is reachable.
- **Prisma 6.19.3 + @prisma/client 6.19.3**; schema at `prisma/schema.prisma` implementing
  README Section 11 (User, Account, Session, VerificationToken, Title, FranchiseGroup, Entry,
  Post, Comment, Friendship + Category/Source/FriendshipStatus enums). Schema validated
  (`prisma validate` ✓) and Prisma Client generated ✓.
- **next-auth@4.24.15** (v4 stable) + **@next-auth/prisma-adapter@1.0.7** installed (no auth
  code wired yet — that's post-approval).
- **@tanstack/react-query@5** and **cloudinary** installed.
- `.env.example` committed (DATABASE_URL, NEXTAUTH_SECRET/URL, GOOGLE_CLIENT_ID/SECRET,
  CLOUDINARY_URL, TMDB_API_KEY, ANILIST_API_URL); local `.env` created and gitignored.
- `postinstall: prisma generate` added to package.json.
- `tsc --noEmit`, `next build`, and `eslint` all pass.

### Decisions made during implementation (and why)
1. **Prisma 6.19.3, not 7.x/8.x.** `prisma@latest` is an 8.0.0 release candidate with a
   restructured CLI, and Prisma 7 removed `url = env("DATABASE_URL")` from schema files
   (requires `prisma.config.ts` + driver adapters). README Section 10 explicitly favors
   well-documented tooling to minimize agent mistakes → pinned to the classic, stable v6 line.
2. **NextAuth v4 stable, not v5.** As of today `next-auth@latest` is 4.24.15; v5 is still
   `beta` (5.0.0-beta.32). v4 + `@next-auth/prisma-adapter` is the stable pairing.
3. **Self-hosted Geist font via the `geist` npm package** instead of `next/font/google` —
   Google Fonts is unreachable from this sandbox (build was failing). The package uses the
   same `--font-geist-sans` / `--font-geist-mono` CSS variables, so globals.css is unchanged.
4. **Schema modeling decisions** (all flagged to the user for approval):
   - `Post.rating` is `Int` (whole numbers 0–10) — README says "numeric 0–10" without
     specifying halves.
   - One Post per (user, entry) via `@@unique([userId, entryId])` — re-rating updates the
     existing post (`updatedAt`) instead of creating a duplicate; feed bump happens only when
     a NEW entry is posted, per README Section 5.
   - Franchise reference lives on `Entry.franchiseGroupId` (README Section 11), not on Title
     (Section 7's cached-fields wording suggests Title, but Section 11 is the explicit model).
   - `Entry` carries both `seasonNumber Int?` and `seasonLabel String?` ("season number/label
     if applicable" — number for seasons/cours, label for OVAs etc.).
   - Feed is derived from `Post.createdAt` — no separate FeedEvent model (README: "Each Post
     is what generates a feed event"; deep-link to the entry works via `Post.entryId`).
   - `Friendship.status` = pending | accepted only (decline = delete the row, flagged as a
     question).
   - `User.username` nullable + unique (chosen during onboarding after first Google login).
   - Deletion policy: user-owned rows cascade; Title/Entry use `Restrict` so cached content
     can't silently delete posts.
   - `Title` has `@@unique([source, sourceId])` so each cached title is stored once per source.

### Known issues / blockers
- **`binaries.prisma.sh` is blocked from this sandbox** → Prisma CLI can't download its
  engines here. Workaround used: `PRISMA_SCHEMA_ENGINE_BINARY` / `PRISMA_QUERY_ENGINE_LIBRARY`
  / `PRISMA_QUERY_ENGINE_BINARY` pointing at a dummy executable to skip download; `validate`,
  `format`, and `generate` all succeeded. On a normal network (user machine / Vercel) engines
  download automatically — no project change needed. Runtime DB queries still require the
  real query engine binary.
- **`ui.shadcn.com` is blocked from this sandbox** → shadcn components can't be added until
  network access is available; config is in place so `npx shadcn add button` etc. will work.
- No Supabase database provisioned yet — no migrations have been run.
- Product name is still TBD (placeholder used in `app/layout.tsx` metadata).

### What should happen next
- **WAIT for explicit user approval of `prisma/schema.prisma`** (mandatory checkpoint — do not
  build features until approved).
- After approval: provision Supabase Postgres → `prisma migrate dev` → `lib/prisma.ts`
  singleton → NextAuth Google auth + onboarding (username) → search UI with category tabs →
  post creation → feed.

---

## [Date: 27/09/2026] — Franchise-group matching design (awaiting user sign-off)

### What was worked on
- User **approved the schema as-is** (all 7 flagged decisions confirmed: Int rating, one Post
  per (user, entry), franchise ref on Entry, seasonNumber+seasonLabel, no FeedEvent model,
  pending/accepted friendship, nullable unique username).
- Per the user's follow-up, designed the **franchise-group matching logic** for TV (TMDb) and
  anime (AniList) and presented it for sign-off. **Nothing has been wired into code** — the
  user explicitly wants to approve the anime approach before it is built.

### Design summary (full detail presented in chat)
- **TV (TMDb):** `/search/tv` returns shows (parent IDs). Group key = `tmdb:{showId}`,
  entry key = `tmdb:{showId}:s{seasonNumber}`. No relation walking. Spin-offs/remakes are
  separate TMDb IDs → separate groups.
- **Anime (AniList):** season/cour entries are separate media IDs linked only via the
  `relations` field. Matching = **PREQUEL-chain walk to the root media** (deterministic
  tie-break: earliest air date, then lowest media ID; visited-set + max depth 10). Group key
  = `anilist:{rootMediaId}`, entry key = `anilist:{mediaId}`. Relations are cached in our DB
  (new `AniListRelation` model) so walks are local after first pass. Season numbers parsed
  from title text ("Season 2", "2nd Season", "Part 2", "Cour 2", "2期"), fallback null;
  entries ordered by seasonNumber → air date → title. AniList `format` MOVIE/MUSIC →
  standalone (no group), per README "movies are standalone".

### Schema delta requested (needs explicit sign-off — schema was approved as-is)
1. `FranchiseGroup.sourceKey String? @unique` — deterministic group key
   (`tmdb:1396`, `anilist:1210`); avoids name-collision bugs ("The Office" US vs UK) and makes
   group upserts idempotent under concurrency.
2. `Entry.entryKey String? @unique` — deterministic entry key (`tmdb:{show}:s{n}`,
   `anilist:{mediaId}`, `tmdb:movie:{id}`). Needed because the existing
   `@@unique([titleId, franchiseGroupId, seasonNumber, seasonLabel])` cannot dedup NULLs
   (Postgres treats NULLs as distinct) — without it, two users posting the same anime season
   create two Entries, which breaks the one-grouped-card rendering and can bypass the
   `(userId, entryId)` Post uniqueness.
3. `model AniListRelation` — cached AniList relation edges (`fromTitleId`, `toSourceId`,
   `relationType`) so the root walk doesn't hit AniList on every render (rate limits).

### Open decisions presented to the user (recommendations in parentheses)
1. Anime MOVIE/MUSIC → standalone vs grouped? (standalone)
2. Anime SPECIAL/OVA → grouped with seasonLabel vs standalone? (grouped — README lists OVAs)
3. Continuation chains (Naruto → Shippuden → Boruto) → one group per chain root vs split per
   show? (one group per root)
4. Multiple-prequel branches (Fate routes) → tie-break by earliest air date vs lowest media
   ID? (earliest air date)
5. User override at post time (reassign entry to another group / make standalone) — in MVP or
   deferred? (recommend deferring to keep MVP scope)
6. Approve the 3-item schema delta above.

### Environment notes / blockers
- **The sandbox was rebuilt from the git snapshot between sessions:** `node_modules` and the
  gitignored `.env` did not survive, and the local branch had been reset to `a7f445c`.
  Restored via `git fetch origin arena/01a0dee7-self-project` + `git reset --hard FETCH_HEAD`
  → local branch back at the scaffold commit `5133666`, working tree clean.
- **`.env` is missing in this environment** — user stated `DATABASE_URL` (Supabase) and Google
  OAuth credentials are in `.env`, but the file is not present here (gitignored files don't
  persist across sandbox snapshots). User must restore it before provisioning/migrate.
- Sandbox network still blocks `ui.shadcn.com` and `binaries.prisma.sh` (unchanged).

### What should happen next
- Wait for user sign-off on the anime matching approach + the schema delta.
- Then: restore `.env` + `npm install` → verify Supabase connectivity → `prisma migrate dev`
  (including the delta) → `lib/prisma.ts` singleton → NextAuth Google login + username
  onboarding → category-tab search (local cache first, TMDb/AniList fallback) → post creation.
- **Standing gate: stop and check in before starting friends/feed logic.**

---

## [Date: 27/09/2026] — Schema delta applied; auth + search + post creation built (DB migration pending credentials)

### What was worked on
- Applied the approved 3-item schema delta and wired the first vertical slice:
  NextAuth Google login + username onboarding, category-tab cache-first search,
  and post creation with the approved franchise matching.
- **DB-dependent steps (migrate + connectivity verification) are blocked on
  credentials** — see env-var handling below.

### What was completed
- **Schema delta committed + pushed** (`0062162`): `FranchiseGroup.sourceKey`,
  `Entry.entryKey`, new `AniListRelation` model (cached AniList relation edges),
  `Title.aniListRelations` back-relation. Schema validated + client generated.
- **`lib/prisma.ts`** singleton; **`lib/auth.ts`** (NextAuth v4 + Prisma adapter,
  database sessions, session callback attaches `id`/`username`/`isPrivate`).
- **`/signin`** (Google button) and **`/onboarding`** (username picker, 3–20
  chars `[a-z0-9_]`, uniqueness via P2002 handling, server action).
- **Category-tab search**: `/api/search` searches local Postgres cache first
  (≥3 cached hits short-circuits the external call), falls back to TMDb
  (movie/TV) or AniList (anime), caches new titles + AniList relation edges.
  Client: debounced (300ms) TanStack Query, three tabs, poster grid.
- **`lib/franchise.ts`** implements the approved matching: TV via TMDb parent
  show id; anime via PREQUEL-chain root walk (earliest-air-date tie-break,
  then lowest media id; visited-set + depth cap 10); MOVIE/MUSIC standalone;
  season numbers parsed from title text; `seasonLabel` derived when no number.
- **`/api/posts`** (one post per user+entry, re-rate updates in place),
  **`/api/titles/[id]/seasons`** (TV season picker), post-creation dialog with
  0–10 rating picker + optional caption + poster fallback card.
- `next.config.ts`: remote image patterns for `image.tmdb.org` / AniList hosts.
- `tsc --noEmit`, `eslint`, and `next build` all pass (build run with
  placeholder env values since real ones aren't in the sandbox yet).

### Decisions from this session (all approved by user)
1. Anime MOVIE/MUSIC → standalone (no franchise group).
2. Anime SPECIAL/OVA → grouped with `seasonLabel`.
3. Continuation chains (Naruto → Shippuden → Boruto) → one group per chain root.
4. Multiple-prequel branches → tie-break by earliest air date, then lowest
   media id (fresh AniList metadata fetched only in this rare branch).
5. Post-time user override → **deferred to post-MVP**.
6. Schema delta (sourceKey / entryKey / AniListRelation) → applied.

### Known limitations (documented, not silently accepted)
- **No manual franchise override (decision #5).** If the auto-grouping walk
  misclassifies an entry (wrong root, over-merged chain, missed side story),
  there is currently **no user-facing fix** — the entry stays in the wrong
  group until the override feature ships. Mitigation ideas for later: allow
  reassigning an entry's `franchiseGroupId` / nulling it.
- The anime root walk needs relation data; if AniList is unreachable at post
  time and the media was never cached with relations, the entry may land in a
  group of its own (graceful degradation, visible only as odd grouping).

### Environment / credential handling (READ THIS BEFORE ASSUMING ANYTHING)
- **`.env` never persists in the sandbox and is never pushed to GitHub** —
  intentional by agreement. The user re-adds it locally each session.
- **The sandbox resets between turns**: `node_modules` is wiped and the local
  git branch is reset to the branch point (`a7f445c`). **Session-start routine:
  `git fetch origin arena/01a0dee7-self-project && git reset --mixed FETCH_HEAD`
  (working tree survives), then `npm install --ignore-scripts`** (plain
  `npm install` fails here because `binaries.prisma.sh` is blocked and
  `postinstall: prisma generate` can't download engines; run
  `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true PRISMA_QUERY_ENGINE_LIBRARY=/bin/true
  PRISMA_QUERY_ENGINE_BINARY=/bin/true npx prisma generate` manually).
  A mid-turn reset also happened once this session — same recovery applied.
- **Sandbox egress is allowlist-based** (only npm registry + GitHub verified
  reachable): `binaries.prisma.sh`, `ui.shadcn.com`, `api.themoviedb.org` and
  `graphql.anilist.co` are all TLS-blocked from here. Consequence: code can be
  written and compiled in the sandbox, but **live verification of migrations,
  Supabase connectivity, TMDb and AniList must happen on a normal network**
  (user's machine). Nothing in the repo depends on the sandbox — these are
  environment limits, not code defects.
- **Env-var protocol (user's instruction):** there is no secrets panel in the
  sandbox. When a step needs a specific credential, ask for exactly that one
  and why; the user pastes the value into chat. Do NOT ask for the whole
  `.env` upfront. This is a deliberate workflow, not an oversight.
- **TODO — ROTATE BEFORE LAUNCH:** the Google OAuth client secret, Supabase
  database password, and `NEXTAUTH_SECRET` currently in use are **dev-only**
  and are sitting in this chat's history. They must all be rotated before any
  real user touches the app. (Google: new OAuth client; Supabase: reset the DB
  password; NEXTAUTH_SECRET: regenerate + invalidate sessions.)
- Vercel project is live at `https://outoften-bay.vercel.app` and connected to
  the repo, but only holds dummy env values for now — expected at this stage,
  not a bug to fix.

### What should happen next
1. Get `DATABASE_URL` from the user → verify Supabase connectivity → run the
   initial migration (see blocker note below) → confirm tables exist.
2. Get `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXTAUTH_SECRET` →
   end-to-end auth + onboarding verification.
3. Get `TMDB_API_KEY` → verify movie/TV search + caching (AniList needs no key
   and can be verified immediately).
4. Then verify post creation end-to-end (including anime franchise grouping).
5. **Standing gate: stop and check in before starting friends/feed logic.**

### Blocker detail — migrations in this sandbox
`prisma migrate dev` spawns the schema-engine binary from `binaries.prisma.sh`,
which is network-blocked here, so the CLI cannot run migrations in this
sandbox. Plan once `DATABASE_URL` arrives: hand-write the migration SQL that
Prisma would generate for the current schema (standard Prisma DDL conventions),
apply it over the connection string with `pg`, and record the row in
`_prisma_migrations` with the correct sha256 checksum so `prisma migrate dev`
on the user's machine sees an up-to-date database.

---

## [Date: 27/09/2026] — Credentials received; migration SQL written + validated; live verification blocked by sandbox egress

### What was worked on
- Received all four credentials (DATABASE_URL, GOOGLE_CLIENT_ID/SECRET,
  NEXTAUTH_SECRET, TMDB_API_KEY). Wrote them into the local gitignored `.env`.
  Used the user's NEXTAUTH_SECRET as-is (no need to generate a new one).
- Attempted the DB-dependent pipeline steps. **None of the live steps could
  run from this sandbox** — see egress findings below.

### Egress findings (why live verification is impossible here)
- **Supabase direct host is IPv6-only** (`db.<ref>.supabase.co` has no A
  record; sandbox has no IPv6 route → ENETUNREACH).
- **Supabase pooler hosts (IPv4) accept TCP but the proxy kills the
  Postgres session** ("Connection terminated unexpectedly"). Same for a
  control test against example.com:80 — the sandbox egress proxy allowlists
  npm registry + GitHub and drops everything else.
- **TMDb and AniList are TLS-blocked** (same class of failure).
- Conclusion: migrations, connectivity checks, Google login, and TMDb/AniList
  verification must happen on the user's machine. Nothing in the repo depends
  on the sandbox.

### What was completed (verifiable without the external services)
- **Initial migration hand-written** at
  `prisma/migrations/20260927090000_init/migration.sql`, following Prisma's
  exact DDL conventions (enum types, `Table_col_fkey` / `Table_col_key` /
  `Table_col_idx` naming, ON DELETE per relation, `ON UPDATE CASCADE`).
  Because the user applies it with `prisma migrate deploy`, Prisma records the
  `_prisma_migrations` row (and checksum) itself — no hand-inserted row needed.
- **Migration SQL validated against a real Postgres engine** (PGlite, WASM
  build installed from npm): applies cleanly; introspection confirms 11
  tables, 3 enums with correct values, 26 indexes (11 pkeys + 15 secondary,
  all named as Prisma would), 11 FKs with the intended ON DELETE actions
  (Cascade for user-owned rows, Restrict for Title/Entry), and correct column
  types/defaults (e.g. `Post.updatedAt` NOT NULL without default,
  `User.isPrivate` DEFAULT false, `Entry.entryKey`/`FranchiseGroup.sourceKey`
  nullable + unique).
- **`scripts/verify-e2e.mjs`** (+ `npm run verify:e2e`): local verification
  harness the user runs after migrating. Seeds a throwaway user + session row
  directly in the DB (no Google login needed), then exercises the real API
  routes: cache-first search (TV/movie/anime), post creation, franchise
  grouping for a real multi-season TV show and a real multi-season anime
  (root walk), movie standalone behavior, re-rate-in-place, new-season-new-
  post, and no-duplicate caching. Cleans up its user/session/posts; cache rows
  are intentionally kept. `pg` added as a devDependency for this.
- `tsc`, `eslint`, `next build` all pass; script syntax-checked.

### Decisions / notes
- NEXTAUTH_SECRET: used the value the user provided (they offered to let me
  generate one; theirs is fine and avoids extra churn across .env + Vercel).
- **Credential handling for the record:** the four dev credentials live only
  in the gitignored local `.env` (never committed) and in this chat's history.
  They are dev-only and must be rotated before launch (see TODO below). The
  sandbox does not persist `.env`; the user re-adds it each session by
  agreement.

### TODO — ROTATE BEFORE LAUNCH (still open)
- Google OAuth client secret, Supabase DB password, and NEXTAUTH_SECRET are
  dev-only and exposed in chat history. Rotate all three before real users:
  new Google OAuth client, Supabase password reset, new NEXTAUTH_SECRET (and
  update `.env` + Vercel env vars).

### Exact local verification steps for the user (migration history)
1. `npx prisma migrate status` — expect: 1 migration found,
   `20260927090000_init` not yet applied.
2. `npx prisma migrate deploy` — applies the SQL and records the history row.
3. `npx prisma migrate status` — expect: "Database schema is up to date."
4. `npx prisma migrate dev` — the drift check: expect "Already in sync, no
   schema changes or pending changes found." If it instead wants to generate a
   new migration, the hand-written SQL drifted from the schema — report back.
   (If the machine has no IPv6, use the Supabase **Session pooler** string
   from Settings → Database → Connection pooling: username
   `postgres.snjfaujdrokvjhhdpfog`, port 5432.)
5. `npm run dev`, then in a second terminal `npm run verify:e2e` — runs the
   full end-to-end checks (search/caching, franchise grouping, re-rate).
6. Manual Google check: open http://localhost:3000/signin → Sign in with
   Google → should land on /onboarding → pick a username → land on the
   search page.

### What should happen next
- User runs the steps above and reports results (especially step 4's drift
  check and the verify:e2e output).
- Fix anything the verification surfaces.
- **Standing gate: still no friends/feed logic started** — check in before
  that work begins.
---

## 2026-09-27 (session 3) — pool exhaustion root-caused + movie-search bug found and fixed

### What the user verified locally (first real end-to-end pass)
- Google login works (signed in as @lelouch_833), onboarding completes.
- TV search ("dark") and Anime search ("one piece", "attack on titan") return
  correct results; post creation succeeds (`POST /api/posts` 200); anime
  franchise grouping renders correctly.
- `prisma migrate deploy` applied the migration on their machine; the app runs
  against the migrated DB.
- Movie tab NOT yet confirmed — see the bug below.

### Bug 1 (blocking) — intermittent EMAXCONNSESSION / P2024 / P1001
Symptoms, verbatim from the user's terminal:
- `FATAL: (EMAXCONNSESSION) max clients reached in session mode - max clients
  are limited to pool_size: 15` on
  `aws-0-ap-northeast-2.pooler.supabase.com:5432`
- `Timed out fetching a new connection from the connection pool ... Current
  connection pool timeout: 10, connection limit: 21` (Prisma P2024)
- `Can't reach database server at aws-0-ap-northeast-2.pooler.supabase.com:5432`
  (P1001)
- Surfaced through next-auth's `getSessionAndUser` (401s on
  `/api/auth/session`) and as "Showing cached results only. No results." on
  search; re-triggering the same search then succeeded.

Root cause (both halves confirmed):
1. **Pool size vs pooler cap.** Prisma sizes its pool at `num_cpus * 2 + 1`
   (21 on the user's 8-core machine); Supabase's session-mode pooler caps the
   whole project at 15 client connections. Not a code leak — a default that is
   simply too big for this database. One dev server alone could hit the cap;
   cold Next.js route compilation or a second `next dev` made it reliable.
2. **Masking.** The title-cache upserts sat *inside* searchTitles' try/catch,
   so the pool error was reported to the user as a "degraded" external-search
   failure with cached-only results. That is why it looked intermittent and
   "search-related" rather than a connection problem.

Fix (root cause, no retry/cache-fallback masking):
- New `lib/prisma-pool.ts` — pins the runtime pool with an explicit
  `connection_limit` on `DATABASE_URL` (default 5, overridable via
  `PRISMA_CONNECTION_LIMIT`, and an explicit `?connection_limit=` in the URL
  always wins). `lib/prisma.ts` passes it as `datasourceUrl`, so migrations
  (which use `directUrl`) are unaffected.
- `lib/titles.ts` — only the *external* lookup may degrade now; database
  failures propagate as real errors instead of being relabelled "showing
  cached results only".
- `.env.example` documents both URLs and the reasoning (see below).

directUrl decision: **yes, added** — `prisma/schema.prisma` now has
`directUrl = env("DIRECT_URL")` so `prisma migrate`/`db push` run off the
app's pooled connection. Note this makes `DIRECT_URL` **required** for all
Prisma commands (`validate`/`generate`/`migrate` fail without it — verified
locally with prisma 6.19.3), so it must exist in `.env` locally *and* in the
Vercel project env before the next deploy builds.

### Bug 2 (found while auditing the movie path) — TMDb movie/TV id collision
`Title` had `@@unique([source, sourceId])`, but TMDb movie and TV IDs are
independent sequences that collide numerically. TMDb staff, verbatim:
"Entry number 1396 in the TV section is Breaking Bad and entry 1396 in the
movie section is Mirror."
Consequence: `upsertTmdbTitle`'s where-clause matched on (source, sourceId)
only, so caching the movie found the cached TV row and returned it unchanged
(`update: {}`) — the Movie tab displayed a TV show, the dialog then demanded a
season, and the movie was never cached at all. Matches the reported
"movie-search bug".
Fix: `@@unique([source, category, sourceId])` + migration
`20260927101500_title_source_category_unique` (pure index swap — the old key
was stricter, so no existing row can violate the new one) + compound-key
renames at the 4 call sites (`source_category_sourceId`).

### Sandbox verification (PGlite, no live DB reachable from the sandbox)
- Pool-cap rewriting: 6/6 checks pass (bare URL, existing params, explicit
  limit wins, percent-encoded password preserved, env override, missing URL).
- Migration applies on top of the init migration; movie 1396 ("Mirror") and tv
  1396 ("Breaking Bad") now coexist, the TV row is untouched, and AniList
  dedup is unchanged (one row per anilist sourceId).
- Old schema reproduced for contrast: the movie upsert created nothing and the
  Movie tab would have shown "Breaking Bad (tv)".
- `tsc`, `eslint`, `next build` all pass after the changes.

### Exact local verification steps for the user
1. Edit `.env`: append the pool params to the existing session-pooler URL and
   add DIRECT_URL (same host, no connection_limit):
   `DATABASE_URL="...@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=5"`
   `DIRECT_URL="...@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"`
2. Kill any stray `next dev` processes (each holds its own pool).
3. `npx prisma migrate status` — expect the new migration
   `20260927101500_title_source_category_unique` listed as not yet applied.
4. `npx prisma migrate deploy` — applies the index swap.
5. `npx prisma migrate status` — "Database schema is up to date."
6. `npx prisma migrate dev` — drift check: "Already in sync". (DIRECT_URL must
   be set or every Prisma command errors.)
7. `npm run dev` and re-run the searches that failed (Movie tab included,
   several times in a row) — expect no EMAXCONNSESSION/P2024 and no
   "Showing cached results only" banner.
8. Movie-tab check for bug 2: search a title whose TMDb movie id collides with
   a cached TV id (e.g. "mirror" after "breaking bad" has been searched on the
   TV tab) — expect the actual movie, not the TV show.

### What should happen next
- User reports whether the pooling errors are gone and whether the movie tab
  behaves; if the movie-search symptom was something *other* than the
  collision above, describe it and it gets chased separately.
- **Standing gate: still no friends/feed logic started** — check in before
  that work begins.

---

## 2026-09-27 (session 3, continued) — verify:e2e TLS failure root-caused; collision fix wired into the harness

### Migration side: confirmed by the user
`migrate status` → `migrate deploy` → `migrate status` → `migrate dev` all clean:
`20260927101500_title_source_category_unique` applied, "Database schema is up to
date!", "Already in sync" (drift check passed).

### Bug 3 (blocking verify:e2e) — "self-signed certificate in certificate chain"
`npm run verify:e2e` failed while every Prisma command against the same
`DATABASE_URL`/`DIRECT_URL` worked.

Root cause (found by reading pg 8.23 / pg-connection-string 2.14 in the repo):
- `pg`'s `ConnectionParameters` does
  `Object.assign({}, config, parse(config.connectionString))` — the **parsed
  connection string overrides** anything passed alongside it.
- `pg-connection-string` turns `sslmode=require` (no `sslrootcert`) into a bare
  `ssl: {}` — i.e. "TLS with Node's defaults" = **full chain verification**.
- So the script's existing `ssl: { rejectUnauthorized: false }` was silently
  discarded. Reproduced locally: `new Client({ connectionString: '...sslmode=require', ssl: { rejectUnauthorized: false } }).connectionParameters.ssl` → `{}`.
- The failure itself is environmental: this machine cannot build a trust chain
  to Supabase's certificate (corporate/AV TLS interception, or a missing
  intermediate CA). Not a database or migration problem.

Fix in `scripts/verify-e2e.mjs` (no security relaxation that matters):
- Never pass `connectionString` + `ssl` together. Parse the URL ourselves
  (`new URL`), strip pg's `ssl*` params, and pass host/port/user/password/
  database + an explicit `ssl` object — so nothing can override the policy.
- Policy: **strict verification by default** (`rejectUnauthorized: true`); only
  a chain-trust error (matched by Node's TLS codes / message phrasings) falls
  back to encrypted-but-unverified TLS, for that one local run, with a loud
  warning. TLS is never disabled. `VERIFY_E2E_SSL=require|verify-full` forces
  either mode (default `verify-full`, which refuses to fall back).
- `application_name: "verify-e2e"` so these connections are identifiable in
  Supabase's connection logs.

### Does sslmode=require affect the app's runtime Prisma connection? No.
- Prisma's documented Postgres `sslmode` values are prefer (default) / disable /
  require, where require = "Require TLS or fail" — encryption, no certificate
  verification. Prisma's own recommended connection strings use
  `sslmode=require`.
- Empirical proof from this session: `prisma migrate status/deploy/dev` (same
  Rust engine the client uses) connected to the same host with
  `sslmode=require` and no CA chain problems, while only the `pg`-based script
  failed. If the client verified chains, migrate would have failed too.
- Supabase's pooler requires TLS anyway, so `require` only removes the
  plaintext fallback that `prefer` allows — no functional change.
- Caveat for later (not actionable now): Prisma v7's driver adapters / query
  compiler change TLS trust handling (prisma/orm discussion #28610 — the CLI
  engine and the adapter-based client can have *different* trust requirements,
  and `sslaccept=strict`/`sslrootcert` do trigger verification). We are on
  Prisma 6.19.3 with `prisma-client-js`, so this does not apply.

### Movie/TV collision fix — now verified by the harness itself
`scripts/verify-e2e.mjs` gained a "Movie/TV id collision" section that runs
against the live DB:
1. asserts the unique index is `Title_source_category_sourceId_key` (and the
   old `Title_source_sourceId_key` is gone),
2. asserts every Movie-tab result is backed by its own `category='movie'` row
   with a matching name — the exact invariant the old bug violated (a TV row
   leaking onto the Movie tab),
3. when TMDb returns movie id 1396 ("Mirror", the id the TV flow cached as
   "Breaking Bad"), asserts it resolves to the movie and posts as a standalone
   `tmdb:movie:1396` entry; if TMDb doesn't return that id for the query
   "mirror", the check is reported as SKIP (not a failure) and check 2 still
   covers the collision.
Also fixed two pre-existing queries that assumed one row per
(source, sourceId) — they now scope to `category='tv'`, since the new key
legitimately allows a movie and a TV show to share a numeric id.

Sandbox re-verification (PGlite): 13/13 checks pass — pool-cap URL rewriting
(6), old-schema collision reproduction (2), new-schema coexistence (1), movie
row invariant (1), AniList dedup unchanged (1), index names match what the
harness asserts (1). `tsc`, `eslint`, `next build`, `node --check` all green.

### Known items (not to act on now)
- Vercel's GitHub deployment check still fails — the project has placeholder
  env vars only (and now also needs `DIRECT_URL`, or its build's
  `prisma generate` fails).
- The user's "movie-search bug from last session" symptom is still undescribed;
  the collision bug above is fixed and now covered by the harness, so if their
  symptom was something else it still needs to be reported.

### What should happen next
- User re-runs `npm run verify:e2e` (with `npm run dev` in a second terminal)
  and pastes the output — expecting the TLS fallback warning (once) and then
  all checks passing, including the new collision section.
- **Standing gate: still no friends/feed logic started** — check in before
  that work begins.

---

## 2026-09-27 (session 3, continued) — verify:e2e run 2: two failures root-caused, harness corrected

User ran `verify:e2e`: 17/19 passed, 1 skipped (expected), 2 real failures.
TLS fallback warning appeared once, as designed. TV flow (8 checks), movie
standalone entry, cache non-duplication, and the collision unique index all
confirmed working.

### Failure 1 — "every movie result is backed by its own movie-category row — 0 movie results verified"
Diagnosis: the check was **under-instrumented**, not wrong. It searched
`/api/search?category=movie&q=Mirror` and treated "0 results" as a failure
without reporting the HTTP status or the route's `degraded` message — so a
non-200, a 500, or a degraded external-search failure were all
indistinguishable from "TMDb returned nothing". The earlier movie-flow check
("Inception") passed because it is a different query; "Mirror" is a weak query
that depends on TMDb surfacing one specific id (1396), which it did not.
Cannot be reproduced from the sandbox (TMDb/AniList/Supabase egress is blocked),
so the cause of the empty set is not yet known — the next run will say.
Fixes:
- New `searchApi()` helper: every search the harness depends on now reports
  `status` + `degraded`, so an empty result set can never masquerade as a pass
  or a mystery failure. TV/movie/anime searches all use it.
- The invariant check now runs on "Inception" (the same query the movie flow
  uses, known to return hits), so it always has rows to verify.
- Added a **deterministic, TMDb-independent** proof: a movie row for the same
  numeric id as the cached TV row must be insertable and coexist. Under the old
  (source, sourceId) key that INSERT threw a unique violation — which is exactly
  why the movie was never cached — so the check doubles as a regression test.
  Cleans up its probe row in a `finally`.
- The targeted "Mirror" probe remains, but an absent id is now a SKIP that
  prints what actually came back.

### Failure 2 — "second anime season lands in the SAME franchise group": anilist:18397 + anilist:20958
**The app is behaving exactly as the approved PREQUEL-walk design specifies;
the harness picked two entries that are not in the same PREQUEL chain.**

Actual AniList relation data (fetched from anilist.co):
- **18397 = "Shingeki no Kyojin OVA"** — edges: `SOURCE`→manga 53390,
  `PARENT`→16498. **No PREQUEL edge.**
- **20958 = "Shingeki no Kyojin Season 2"** — `PREQUEL`→16498, `SEQUEL`→99147.
- **16498 = "Shingeki no Kyojin" (S1)** — `PREQUEL`→**20811**, `SEQUEL`→20958,
  `SIDE_STORY`→18397/99634, `ALTERNATIVE`→20691/20692, …
- **20811 = "Shingeki no Kyojin Gaiden: Kuinaki Sentaku" (No Regrets OVA)** —
  only `SEQUEL`→16498 and `ALTERNATIVE`→manga. **No PREQUEL edge → chain root.**

Step-by-step walk as the code executes it:
- `resolveAnimeEntry(18397)`: format OVA (not MOVIE/MUSIC → not standalone) →
  `findAnimeRoot`: relations are [SOURCE, PARENT] → `prequelIds` empty → break
  on iteration 1 → **root = 18397** → group `anilist:18397`.
- `resolveAnimeEntry(20958)`: format TV → walk: 20958 --PREQUEL--> 16498
  --PREQUEL--> 20811 → no prequel → **root = 20811** → group `anilist:20811`.
- Two different groups → the check failed. Both entries behaved correctly.

Root cause of the failure: the harness chose `s1 = results[0]` (AniList's
SEARCH_MATCH ranking put the **OVA** first for "Attack on Titan") and
`s2 = first result whose name matches /season 2|2nd season|part 2/` (S2). An OVA
whose only edges are SOURCE/PARENT is its own chain root by design, so it can
never share a group with S2. Verified locally: with the correct pair (S1 16498 +
S2 20958) both walks land on root 20811 → one group, which is the approved
design's "Attack on Titan S1–S4 → one group".

Harness fix: pick a genuine PREQUEL-linked pair from the **cached relation
edges** (a result whose `PREQUEL` points at another result), instead of trusting
AniList's ordering or the result names. Two new assertions: both entries share
exactly one franchise group, and that group is keyed on a real PREQUEL ancestor
of the later entry (computed with a recursive CTE over the cached edges).

**Product observation, NOT changed (approved design — do not revisit):** because
AniList lists the "No Regrets" OVA (20811) as a PREQUEL of S1, the Attack on
Titan franchise group is keyed `anilist:20811` and **named** "Shingeki no Kyojin
Gaiden: Kuinaki Sentaku" — i.e. the group for the main series carries a prequel
OVA's name. That follows directly from "group key = PREQUEL chain root".
Candidate post-MVP refinement: prefer the earliest-air-date / TV-format chain
member for the group *name* (key can stay the root id). Also noted: OVAs whose
only edge is PARENT stay standalone, which may or may not be desired.

### Sandbox verification (PGlite, real AniList AoT graph replayed)
11/11 pass: pair selection picks (16498 → 20958); ancestor closure of S2 is
{16498, 20811}; walk(S1) and walk(S2) both root at 20811; walk(OVA 18397) roots
at itself; 20811 has no PREQUEL; old schema rejects the colliding movie INSERT
while the new one accepts it and both rows coexist; `pg_indexes` reports only
the new index. `node --check`, `eslint`, `tsc`, `next build` green.

### What should happen next
- User re-runs `npm run verify:e2e`. Expected: the collision section's three
  checks pass deterministically, the anime section reports the real
  S1→S2 pair and both group checks pass, and the "Mirror" probe SKIPs while
  printing what TMDb actually returned (status/degraded) — which finally
  answers why "Mirror" came back empty.
- **Standing gate: still no friends/feed logic started.**
