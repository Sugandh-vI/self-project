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

---

## 2026-09-27 (session 3, final) — all 23 e2e checks pass; session closed

### Final verification (user, local machine, real Supabase database)
`npm run verify:e2e`: **23/23 checks passed — 0 failures, 0 skips.**
- TV flow 8/8: search, local cache, post creation, franchise group, season entries,
  re-rate in place, new season = new entry in the same group.
- Movie flow: standalone entry, no franchise group.
- Movie/TV id collision 6/6: unique index shape, deterministic coexistence probe,
  row invariant on real search results, targeted probe.
- Anime PREQUEL-chain grouping: correct pair selected, correct chain root,
  correct single-group result.
- Cache behaviour: repeat search does not duplicate cached titles.
- The TLS fallback warning printed once, as designed (this machine cannot build a
  trust chain to Supabase's certificate).

### Session arc (step-by-step detail lives in the three session-3 entries above)
1. **Connection pool exhaustion — `EMAXCONNSESSION` / P2024 / P1001.** Root cause: Prisma
   sizes its pool at `num_cpus * 2 + 1` (21 on the user's 8-core machine) while Supabase's
   session-mode pooler caps the whole project at 15 client connections. Not a code leak —
   single `PrismaClient` behind a correct `globalThis` singleton, no interactive transactions
   — simply a default too large for this database. It surfaced through next-auth's
   `getSessionAndUser` (401s) and as "Showing cached results only" on search because the
   title-cache upserts sat inside the try/catch that was meant for external-API failures.
   Fix: new `lib/prisma-pool.ts` pins an explicit `connection_limit` (default 5;
   `PRISMA_CONNECTION_LIMIT` override; an explicit `?connection_limit=` in the URL always
   wins) applied via `datasourceUrl`; `lib/titles.ts` now lets database failures propagate
   instead of relabelling them as degraded searches.
2. **`directUrl` / `DIRECT_URL`.** Added to the datasource so `prisma migrate` / `db push` run
   off the app's pooled connection. Side effect (verified with prisma 6.19.3): `DIRECT_URL`
   becomes **required** for every Prisma command, so it must exist locally and in the Vercel
   project before the next deploy builds. No effect on the app's runtime connection — Prisma's
   `sslmode=require` means "require TLS", not certificate verification, and `prisma migrate`
   connected to the same host without issue while only the `pg`-based script failed.
3. **Movie/TV id collision bug.** `Title` had `@@unique([source, sourceId])`, but TMDb movie and
   TV ids are independent namespaces that collide numerically (TMDb staff, verbatim: "entry
   number 1396 in the TV section is Breaking Bad and entry 1396 in the movie section is
   Mirror"). A movie upsert therefore matched the cached TV row and returned it unchanged
   (`update: {}`) — the Movie tab displayed a TV show, the post dialog then demanded a season,
   and the movie was never cached at all. Fix: `@@unique([source, category, sourceId])` +
   migration `20260927101500_title_source_category_unique` (a pure index swap — the old key was
   stricter, so no existing row can violate the new one) + compound-key renames at the four
   call sites (`source_category_sourceId`).
4. **`verify-e2e.mjs` TLS failure.** `pg`'s `ConnectionParameters` does
   `Object.assign({}, config, parse(config.connectionString))`, so the parsed connection string
   overrides anything passed alongside it, and `pg-connection-string` maps `sslmode=require`
   (with no `sslrootcert`) to a bare `ssl: {}` — i.e. TLS with Node's defaults = full chain
   verification, which this machine cannot satisfy. The script's own
   `ssl: { rejectUnauthorized: false }` was silently discarded. Fix: never pass a connection
   string to `pg` — parse the URL ourselves, drop `ssl*` params, and set the policy explicitly:
   strict verification by default, a narrow chain-trust-only fallback to encrypted-but-
   unverified TLS for that local run (loud warning, TLS never disabled), and
   `VERIFY_E2E_SSL=require|verify-full` to force a mode.
5. **Anime-grouping harness bug — the product logic was correct all along.** The harness
   compared `results[0]` against "the first result whose name matches a season regex".
   AniList's `SEARCH_MATCH` ranking puts the Attack on Titan **OVA** (anilist:18397) first for
   "Attack on Titan", and that OVA's only edges are `SOURCE`/`PARENT` — **no `PREQUEL`** — so
   under the approved PREQUEL-walk design it is its own chain root and can never share a group
   with Season 2 (anilist:20958). The app's walk was correct for both entries: 18397 → root
   18397; 20958 → 16498 (S1) → 20811 (No Regrets OVA) → root 20811. Fix: select a genuine
   PREQUEL-linked pair from the cached relation edges, and additionally assert the shared group
   is keyed on a real PREQUEL ancestor of the later entry (recursive CTE over the cached edges).

### Final status
- **All 23 e2e checks pass** against the real Supabase database (user-verified this session).
- Migration `20260927101500_title_source_category_unique` applied and verified
  (`migrate status` → `migrate deploy` → `migrate status` → `migrate dev` drift check all clean).
- `tsc`, `eslint`, `next build`, `node --check` green.
- **No known open bugs.**
- Vercel's deployment check still fails — expected, that project has placeholder env vars
  only. It will also need `DIRECT_URL` added before the next real deploy builds.
- Sandbox egress blocks TMDb / AniList / Supabase / prisma engine downloads, so live
  verification has always been done on the user's machine, never in the sandbox.

### Unresolved product decision — flagged, deliberately NOT acted on
The Attack on Titan franchise group is keyed **and named** after its PREQUEL-chain root, which
AniList happens to make the "No Regrets" prequel OVA (anilist:20811, "Shingeki no Kyojin Gaiden:
Kuinaki Sentaku") rather than the mainline show. This follows directly from the approved design
("group key = PREQUEL chain root"), so it was not changed. Post-MVP decision to make: keep the
root id as the group *key* but name the group after its earliest TV-format / earliest-air-date
entry instead. Related consequence of the same design: OVAs whose only edge is `PARENT` stay
standalone rather than joining their parent series' group.

### TODO — ROTATE BEFORE LAUNCH (still open, not forgotten)
Google OAuth client secret, Supabase DB password, and `NEXTAUTH_SECRET` are dev-only and have
been exposed in chat history. Rotate all three before real users: new Google OAuth client,
Supabase password reset, new `NEXTAUTH_SECRET` (and update `.env` + Vercel env vars).
Also still deferred to post-MVP and documented as a known limitation: the post-time user
override for entry grouping (reassign an entry's group / make it standalone).

---

# What to do when this session resumes

**Built and verified end-to-end for movies, TV and anime:** cache-first title search across all
three category tabs (TMDb for movies/TV, AniList for anime), post creation with ratings and
captions, franchise and season grouping (TMDb parent shows; AniList PREQUEL-chain root walk),
re-rate-in-place, new-season-new-post, and the movie/TV id-collision-safe title cache. Google
auth and onboarding work. The e2e harness (`npm run verify:e2e`) passes 23/23 against a real
database.

**Next milestone: friends and feed logic.** Nothing has been written for it — the standing gate
has been respected throughout. Scope as designed:
- **Friend requests:** send / accept (and reject), using the `Friendship` model already in the
  schema.
- **Profile visibility:** public/private, using the `User.isPrivate` flag already in the schema.
- **Friend activity feed**, including the "new season = fresh feed event that bumps to the top"
  behaviour designed earlier — re-rating an entry that already has a post must NOT bump it;
  only a genuinely new entry does.

**Before writing any code for that milestone:**
1. Read this `journey.md` **in full** first. It is the authoritative record of every decision,
   including the approved schema and the franchise-matching design review.
2. Propose a design for the friends/feed **data model** (any schema delta beyond the existing
   `Friendship` model) and the **API routes**, then get explicit sign-off before implementing —
   the same pattern as the franchise-matching design review.
3. Do not start friends/feed implementation until that sign-off lands.

---

## 2026-10-01 (session 4) — Friends + feed DESIGN (awaiting sign-off; no feature code written)

Session branch: `arena/01a0f881-self-project`, branched off `main` at `4b73436` (main is at the
tip, so this session starts from everything session 3 shipped). Standing gate respected:
**no friends/feed code has been written.** This entry is the design review, mirroring the
franchise-matching review from session 3.

### 0. What already exists and is being reused (read before designing)

- `Friendship { requesterId, recipientId, status: pending|accepted, createdAt }`,
  `@@unique([requesterId, recipientId])`. **No indexes beyond that unique.**
- `User.isPrivate Boolean @default(false)`, `User.username String? @unique`.
- `Post` — one row per (user, entry) via `@@unique([userId, entryId])`; `createdAt @default(now())`,
  `updatedAt @updatedAt`, indexes on `createdAt` and on `userId`.
- `/api/posts` upserts: re-rating the same entry runs the **update** branch (`rating`, `caption`)
  so `createdAt` is untouched, while a new entry runs the **create** branch so `createdAt` is now.
  **The agreed bump semantics therefore already fall out of the existing write path** — ordering
  the feed by `Post.createdAt` gives "new season bumps, re-rate doesn't" with zero extra logic.
  This is the single most important finding of this review: it is why no `FeedEvent` model is
  needed (see §2).

### 1. Visibility model (one place, enforced server-side)

New `lib/visibility.ts` is the **only** place that decides whether a viewer may see a profile's
content. Every surface (profile page, `/api/feed`, and any future comments endpoint) calls it —
never the UI on its own — so there is exactly one rule to audit.

```ts
type ViewerRelation = "self" | "friends" | "outgoing" | "incoming" | "none";
relationOf(viewerId: string | null, targetId: string): Promise<ViewerRelation>
canViewContent(relation: ViewerRelation, target: { isPrivate: boolean }): boolean
//   self | friends            -> true
//   outgoing | incoming|none  -> !target.isPrivate
```

- `self` — own profile, always full access.
- `friends` — accepted friendship in **either** direction (single-row model, see §5).
- `outgoing`/`incoming` — a pending request exists (drives "Request sent" / "Accept?" buttons).
- `none` — stranger.
- Anonymous (`viewerId === null`): every authed page already redirects to `/signin` via
  `requireUser()`, so there is no logged-out surface. **Default: the whole app stays
  authed-only for MVP** (no public/SEO profiles, no `robots` decisions yet).

Locked (private, non-friend) profile renders: avatar, display name, `@username`, a private badge,
and the request button/state. **No posts, no ratings, no captions, no counts.** The API returns
`canView: false` and an empty post list — a locked profile leaks nothing over HTTP, not just in
the DOM.

### 2. Feed model — no new table

**Decision: no `FeedEvent` / `FeedSeen` model.** Rationale, recorded so it isn't re-litigated:

- README §11 says "Each Post is what generates a feed event" — the post *is* the event.
- Bump-on-new-entry is already encoded in `Post.createdAt` by the existing upsert (§0).
- Deep-linking into the correct slide of a grouped card needs only `Post.id` (§4).
- An event log would only buy things we don't need yet: read/unread state, "bump on re-watch",
  burst collapsing. If any of those become requirements, the migration is additive and easy.

Feed query: `Post where userId IN (myAcceptedFriendIds) order by createdAt desc, id desc`.
Pagination is **keyset on `(createdAt, id)`** (`id` breaks same-millisecond ties; `createdAt`
alone is not unique). Cursor is an opaque base64url `{c: ISO createdAt, i: postId}`, so the
client never sees or constructs ordering internals:

```sql
WHERE userId IN (...) AND (createdAt < c OR (createdAt = c AND id < i))
ORDER BY createdAt DESC, id DESC LIMIT n
```

`friendIds` comes from one `findMany` with
`OR: [{ requesterId: me, status: accepted }, { recipientId: me, status: accepted }]`.
`IN` lists are fine at MVP scale; noted as the thing to replace with a join/raw SQL if a user
ever has thousands of friends.

Feed **excludes your own posts** by default — your posts live on your profile; the feed answers
"what did my friends watch". Empty states: no friends → "Find friends" CTA; friends who haven't
posted → "Nothing yet."

### 3. Feed item shape (recommended: flat, one row per entry)

```ts
type FeedItem = {
  postId: string;
  createdAt: string;        // feed ordering key
  updatedAt: string;        // > createdAt ⇒ the card can show "edited"
  rating: number;           // 0–10
  caption: string | null;
  permalink: string;        // /u/{username}/p/{postId}
  user:   { id, username, name, image };
  title:  { id, name, posterUrl, category };
  franchise: { id, name } | null;   // set when the entry belongs to a group
  entry:  { id, seasonNumber, seasonLabel };
};
```

One feed row = one watch event = one entry ("Breaking Bad — S2 · 9"), with the franchise name
shown as context and the permalink landing on the grouped card **focused on that entry**. This
keeps `orderBy createdAt` monotonic (a flat list of immutable timestamps), which is what makes
keyset pagination correct: a grouped-card feed would have to order groups by `max(createdAt)`,
which *moves* groups between pages and causes dupes/gaps. (See open decision Q1.)

### 4. Profile pages and grouped posts

- `/u/[username]` — server component, Prisma directly (no HTTP round trip, no second place
  where privacy has to be enforced). Groups posts by `entry.franchiseGroupId ?? post.id`, i.e.
  franchise entries collapse into one swipeable card and standalone movies stay single cards.
  Groups ordered by **most recent post in the group, desc** (same notion of recency as the
  feed); entries **within** a card ordered by `seasonNumber` asc (fallback `createdAt` asc) so a
  card always reads in canonical watch order. Capped at 50 groups for MVP.
- `/u/[username]/p/[postId]` — the canonical permalink, and the only route form we need. It
  looks up the post, resolves its franchise group, and renders the grouped card with **that
  entry focused** — exactly the README §5 "deep-link back to the correct entry/slide". A
  standalone movie post renders as a one-slide card with the same component. Later, comments
  attach to the Post, so this permalink doubles as the comment thread.
- `/profile` — redirect to your own `/u/[username]`.
- `/friends` — incoming requests (accept / decline), outgoing (cancel), friends list (unfriend),
  and a user-search box to send new requests.

Navigation: a shared client `<AppNav/>` (Search · Feed · Friends · @me) inside a new
`app/(app)/` route group, so `/signin` and `/onboarding` stay chrome-free. This means moving
`app/page.tsx` → `app/(app)/page.tsx` (URLs unchanged).

### 5. Friend requests — behaviour on the existing `Friendship` row

One row per pair, `requesterId` → `recipientId`. Lifecycle:

| Action | Actor | Effect |
|---|---|---|
| Send | anyone (not self, target must exist) | create `pending`; if a pending row already exists **in the reverse direction**, flip it to `accepted` instead (auto-accept) |
| Accept | recipient only | `status = accepted` |
| Decline | recipient only | **delete the row** (no `rejected` status — see Q2/§7) |
| Cancel | requester only | delete the row |
| Unfriend | either side | delete the row |

Consequences of "decline = delete", accepted knowingly: no memory of the rejection, so a
declined user can re-request immediately (spam vector, tolerable at MVP scale), and there is no
"request declined" notification (there is no notification system at all yet). If either becomes
a problem the fix is additive: a `rejected` (or `blocked`) status plus `respondedAt`.

Race: two concurrent sends in opposite directions can both insert (the unique constraint is
directional, so it can't catch it). Mitigation in code: send runs in a transaction that
re-checks both directions and catches P2002; accept additionally `deleteMany`s any reverse row.
See Q4 for the alternative (canonical ordering of the pair) — recommendation is to **keep the
current shape**, since requester/recipient is what accept/decline authorization reads naturally
and the table is tiny.

### 6. Proposed schema delta — indexes only, no new models

1. `Friendship`: add `@@index([requesterId, status])` **and** `@@index([recipientId, status])`.
   Today the only index is the unique `(requesterId, recipientId)`, which serves "requests I
   sent" but *not* "requests sent to me" — every incoming-request lookup and every friend-list
   query would seq-scan.
2. `Post`: change `@@index([userId])` → `@@index([userId, createdAt])`. This is the exact shape
   of both the feed query (`userId IN (...) ORDER BY createdAt DESC`) and the profile query, and
   the composite still covers plain `userId` lookups as a prefix.

Both are index-only — one migration, no data rewrite, no downtime, no backfill (the tables are
effectively empty in dev).

Explicitly **not** adding: `FeedEvent`, `Notification`, `Block`, `respondedAt`, per-post
visibility, a canonical-pair `Friendship` reshape (unless Q4 says otherwise).

### 7. API surface

| Method | Path | Notes |
|---|---|---|
| GET | `/api/users/search?q=` | authed only; username partial (case-insensitive) and exact-email match; ≤20 rows; returns id/username/name/image only |
| GET | `/api/friends` | `{ friends, incoming, outgoing }` — drives `/friends` and the nav badge |
| POST | `/api/friends/requests` | body `{ username \| email \| userId }` → `{ status: "pending" \| "accepted" }` |
| POST | `/api/friends/requests/[id]/accept` | recipient only, else 403 |
| DELETE | `/api/friends/[id]` | decline (recipient, pending) / cancel (requester, pending) / unfriend (either, accepted) |
| GET | `/api/feed?cursor=&limit=` | `{ items: FeedItem[], nextCursor }` |
| GET | `/api/users/[username]` | `{ user, viewerRelation, canView }` — profile summary for client bits; the page itself server-renders |

Status codes: 400 self-request/bad body, 404 unknown user, 409 already-friends or
request-already-sent, 403 wrong actor for accept/decline.

New modules: `lib/friends.ts` (relation lookup, friend ids, send/accept/delete),
`lib/visibility.ts` (§1), `lib/feed.ts` (feed query + the post→item mapper shared with profile
pages so a post renders identically in both places).

### 8. Verification plan (extends `scripts/verify-e2e.mjs`, no new harness)

The harness currently seeds one throwaway user + session row; it grows to three (A, B, C) with
distinct session tokens, and a new "Friends & feed" section runs against the live DB:

1. A requests B → row `pending`; B sees it in `incoming`; A sees it in `outgoing`.
2. B accepts → `accepted`; both now see each other in `friends`.
3. Feed: B's feed contains A's posts; **C (stranger) sees none of them** (IDOR check).
4. **Re-rate does not bump** — capture feed order, re-rate an older post, assert the order is
   unchanged and `updatedAt > createdAt`.
5. **New season does bump** — A posts S2, assert it is first in B's feed, and that its permalink
   resolves to the franchise group with S2 focused.
6. **Privacy** — set B `isPrivate`: C gets `canView: false` + no posts; A (friend) still sees
   everything; `/u/b` renders the locked state for C.
7. Reverse request auto-accepts (B requests A while A→B is pending → single accepted row).
8. Unfriend → the ex-friend's posts disappear from the feed immediately.
9. Cursor pagination — ≥25 posts across pages of 20: no overlap, no gaps, stable ordering.
10. Self-request rejected; duplicate request → 409.

### 9. Open decisions put to the user (recommendations in parentheses)

- **Q1 Feed granularity** — flat one-row-per-entry (recommended) vs grouped franchise card per
  user+franchise bumped by its newest entry. (Grouped breaks monotonic keyset pagination and
  contradicts "each Post is a feed event".)
- **Q2 Reverse pending request** — auto-accept (recommended) vs reject with 409.
- **Q3 Friend discovery** — username partial **plus** exact-email lookup (recommended) vs
  username only vs email only. Everyone signs in with Google, so email is the most reliable
  identifier; exact-match-only keeps the enumeration risk small.
- **Q4 Friendship row shape** — keep `requesterId`/`recipientId` with the invariant enforced in
  code (recommended) vs canonical ordered pair `(userAId, userBId)` so Postgres rejects
  duplicate/reverse rows at the DB level.

Defaults I will apply unless told otherwise (flagged so they are easy to overturn):
decline/cancel/unfriend = delete the row; feed excludes your own posts; the whole app stays
authed-only; comments deferred (the `Comment` model exists, nothing reads it yet); profile
groups ordered by most recent activity with entries in season order; no rate limiting on
requests yet.

### 10. Build order once signed off

1. Migration for the two index changes → user runs `migrate deploy` + `migrate dev` drift check.
2. `lib/friends.ts` + `lib/visibility.ts` + friend-request routes + `/friends` page + `(app)`
   route group with nav.
3. `lib/feed.ts` + `/api/feed` + `/feed` (TanStack `useInfiniteQuery`).
4. Profile pages `/u/[username]` and `/u/[username]/p/[postId]` (grouped cards, privacy).
5. Extend `verify-e2e.mjs` with §8's ten checks; user runs it locally; fix whatever surfaces.

### 11. Carried-over TODOs (unchanged, still open)

- **ROTATE BEFORE LAUNCH:** Google OAuth client secret, Supabase DB password, `NEXTAUTH_SECRET`
  are dev-only and have been exposed in chat history.
- `DIRECT_URL` must be added to the Vercel project env before the next real deploy builds.
- Post-MVP: manual franchise override for entry grouping; consider naming a franchise group after
  its earliest TV/air-date entry rather than its PREQUEL-chain root (Attack on Titan is currently
  named after the "No Regrets" OVA).

### 12. Revision (user feedback, same session) — one card per franchise, grid + carousel

User's direction, in their words: like Instagram — a **grid of square tiles**, one tile per
post, and clicking a tile opens a **carousel you can swipe** containing every entry of that
franchise ("you go to Naruto, and all seasons are logged in one post"). It must **not** render
as separate posts per season. (They were mid-sentence — "for that, I'm thinking of the thing" —
so two sub-decisions are still open, see Q1a/Q1b below.)

**Consequence: the card = the franchise group, not the individual Post.** This supersedes the
flat one-row-per-entry recommendation in §3 (Q1 resolved in the user's favour; the pagination
cost is handled below).

**The data model does NOT change.** Each entry keeps its own `Post` row — per-entry rating,
per-entry caption, per-entry timestamp, because README §5 is explicit that a franchise is "not
one shared rating for the whole franchise". Posts remain the *write/activity* unit; the group is
a *read* grouping layered on top. The agreed bump semantics survive untouched:
- new season → new `Post` → the group's `MAX(createdAt)` is now → the card jumps to the top;
- re-rate → `createdAt` untouched → `MAX(createdAt)` unchanged → the card stays where it was.

Same invariant, same e2e checks — only the query and the rendering change.

**Pagination is the real cost of this choice, and it needs a fix.** Ordering groups by
`MAX(createdAt)` means a card can move *while the client is scrolling*: a card that was below
the cursor receives a new entry, jumps above the cursor, and a naive keyset query then skips it
forever (a silent gap). Fix: **snapshot pagination.** The first page response returns
`snapshotAt = now()`; every later page is computed as of that instant —
`MAX(createdAt) WHERE createdAt <= snapshotAt` — so nothing can cross the cursor mid-session.
Activity newer than the snapshot is excluded until the client refreshes, which is exactly how
social feeds behave and later becomes a "N new posts" affordance. Without the snapshot,
duplicate/gap bugs are a matter of time, not luck.

Query shape: Prisma cannot express "group by franchise, order by MAX(createdAt), paginate"
without N+1 or unbounded fetching, so the ordering pass is a single parameterised `$queryRaw`
(`Prisma.sql`) returning `(groupKey, lastActivityAt, entryCount)` — where `groupKey` is
`franchiseGroupId`, or the post id prefixed for standalone movies. The post/title/user rows for
those groups are then fetched with an ordinary typed Prisma query and assembled by
`lib/feed.ts`. SQL stays confined to "which groups, in what order"; every row that gets
serialised to the client is still fetched and typed through Prisma.

Note: `FranchiseGroup` has no poster of its own (it has only `name` + `category`), so a tile's
image comes from one of its entries' `Title.posterUrl` — see Q1b.

### 13. Resolved design (user sign-off round, 2026-10-01)

**Q1 — Layout: feed = swipeable cards, profile = tile grid.**
- **`/feed`** scrolls vertically, one card per franchise group, carousel swipeable **inline**, so
  the newest rating + caption are readable without tapping (Instagram's multi-image post).
- **`/u/[username]`** is the square tile grid — tap a tile to open the full-screen carousel.
- Both surfaces render the same underlying group; only the container differs. `lib/feed.ts`
  exposes `getFeedGroups()` and `getProfileGroups()`, sharing one `groupPosts()` +
  `mapGroupToCard()` so a franchise renders identically in both places.

**Q2 — Tile number: the user's AVERAGE across the entries they rated in that group.**
Chosen over my "latest rating" recommendation, and that is fine — but recorded with the tension
it creates, because README §5 says a franchise is explicitly *not* one shared rating. The
resolution: the average is a **display summary only**. The data keeps one `Post` per entry with
its own rating/caption/timestamp, the carousel shows every entry's own rating, and the tile
labels the number as an average rather than presenting it as "the" score:
- tile badge = `avg 8.2` (one decimal, trailing `.0` dropped → `8`), plus an entry-count badge
  when the group has more than one entry;
- the **feed card headline still names the fresh activity**: "rated Season 3 · 9 · 2h ago" —
  so the thing that bumped the card is always visible as its own number;
- computed at read time, never stored (a stored average would go stale on every re-rate).
If it ever reads as a franchise score rather than a summary, the fallback is Q2's "latest".

**Q3 — Tile poster: the earliest entry's poster.** Group entries ordered by `seasonNumber` asc
(fallback `createdAt` asc); tile uses the first one's `Title.posterUrl`, giving a stable
"box set" cover. Null poster → the existing README §3 gradient placeholder. All Breaking Bad
seasons share one TMDb poster, so this only visibly matters for anime (separate art per season).

**Q4 — Discovery: username only.** `GET /api/users/search` matches username substring,
case-insensitive, capped at 20 rows, authed-only; **no email lookup** (privacy call — no email
enumeration surface). Accepted trade-off: friends must know each other's handles. Mitigation
added to `/friends`: a "copy/share your `@handle`" affordance so handles can be passed around
outside the app without ever exposing email addresses.

**Q5 — Reverse pending request → auto-accept.** Send first looks for an existing row in either
direction; a pending row in the reverse direction is flipped straight to `accepted`.

**Friendship row shape: unchanged** (`requesterId`/`recipientId`, invariant enforced in code —
transaction + P2002 re-check on send, `deleteMany` of any reverse row on accept). No objection
was raised, and the table is tiny; the canonical-pair reshape stays available if the race ever
becomes real.

### 14. Card spec as resolved (what gets built)

**Feed card**
- header: avatar + display name + `@username` (links to profile)
- inline horizontal carousel; slides in **canonical season order**, each slide = poster + entry
  label ("Season 3" / "OVA") + that entry's own rating + caption + date
- headline: group name · "rated {entry label} · {rating}" · relative time of the bump
- opens on the entry that generated the latest activity (the thing you tapped to see)

**Profile grid tile**
- square crop of the earliest entry's poster (`object-cover`, `object-top` so titles/faces
  survive the 2:3 → 1:1 crop)
- badges: average rating, and an entry count when > 1
- tap → full-screen carousel of every entry, opened on **slide 1** (canonical; no "latest
  activity" context on a profile)

**Permalink** `/u/[username]/p/[postId]` → resolves the post's group and opens the carousel
**focused on that entry** — unchanged from §4, still the future comment thread.

**Snapshot pagination** (§12): `GET /api/feed?limit=20` → `{ snapshotAt, items, nextCursor }`;
`GET /api/feed?limit=20&snapshot=<iso>&cursor=<opaque>` with cursor = base64url
`{a: lastActivityAt, k: groupKey}`. Profile grid uses the same grouping query scoped to one
user, visibility-checked, capped at 50 groups for MVP.

### 15. Build order (unchanged from §10, now fully specified)

1. Migration: the two index changes (§6) → user runs `migrate deploy` + `migrate dev` drift check.
2. `lib/friends.ts` + `lib/visibility.ts` + friend-request routes + `/friends` (with the share
   `@handle` affordance) + `app/(app)/` route group with nav.
3. `lib/feed.ts` (grouping query + mapper) + `/api/feed` + `/feed`.
4. Profile grid `/u/[username]` + carousel permalink `/u/[username]/p/[postId]` + privacy states.
5. Extend `verify-e2e.mjs` with §8's ten checks (adapted to grouped cards) → user runs locally.

---

## 2026-10-01 (session 4, part 2) — friends layer implemented (step 1 + 2 of §15)

Design was signed off first (§13); this entry records what got built. **Step 3 (feed) and
step 4 (profile) are not started.**

### Migration — `20261001090000_friends_feed_indexes`

Exactly the two index changes from §6, nothing else. Validated by replaying the whole chain
(init → collision → this one) into PGlite: **13/13 checks pass**, and `EXPLAIN` on the feed
shape confirms the planner picks it up
(`Bitmap Index Scan on Post_userId_createdAt_idx … Index Cond: userId = ANY(…)`).
- `Post_userId_idx` → `Post_userId_createdAt_idx` (drop guarded with `IF EXISTS`; the CREATEs
  deliberately are not, matching Prisma's own generated migrations — `migrate deploy` applies
  each file once via `_prisma_migrations`).
- New `Friendship_requesterId_status_idx` and `Friendship_recipientId_status_idx`.
- No data rewrite, no backfill, no column changes.

### Code

- **`lib/friends.ts`** — the only module that touches `Friendship`. `getRelation`,
  `getFriendIds` (the feed's membership filter), `listFriendships` (friends + incoming +
  outgoing), `sendFriendRequest`, `acceptFriendRequest`, `deleteFriendship`, `searchUsers`,
  and a `FriendsError` carrying the HTTP status so routes just map it.
- **`lib/visibility.ts`** — `canViewContent(relation, target)` as a pure function plus
  `visibilityFor` / `loadProfileByUsername`. Nothing consumes it yet; it is written now so
  the feed and profile don't invent their own privacy rules.
- **`lib/api-auth.ts`** — `currentUserId()` / `unauthorized()` / `friendsErrorResponse()`.
- **Routes**: `GET /api/users/search`, `GET /api/friends`, `POST /api/friends/requests`,
  `POST /api/friends/requests/[id]/accept`, `DELETE /api/friends/[id]` (decline / cancel /
  unfriend — one endpoint, because all three are the same row deletion).
- **Pages**: `app/(app)/` route group (nav wraps every authed page; `/signin` and `/onboarding`
  stay outside it), `app/(app)/friends/page.tsx` + `components/friends-manager.tsx`,
  `components/app-nav.tsx` with the incoming-request badge.

### Decisions made while implementing (not in the approved design)

1. **Send is not wrapped in a transaction.** A transaction would close the duplicate-row race
   for good, but it holds a pooled connection for its duration and the pool is deliberately
   capped at 5 (`lib/prisma-pool.ts`). Instead: check-then-create, catch P2002, re-read the
   winning row. Same outcome, no held connection. Reads also tolerate a stray duplicate —
   `getRelation` orders by `status asc` so an `accepted` row always wins over a `pending` one,
   and both accept and delete clear any reverse leftover.
2. **`refetchOnMount: false` instead of `initialDataUpdatedAt`.** The natural way to tell
   TanStack the server-rendered data is fresh is `initialDataUpdatedAt: Date.now()`, but
   `react-hooks/purity` fails the lint (and the build) on that — "Cannot call impure function
   during render" — in both the client component *and* the server component. Passing the
   timestamp down as a prop hits the same rule at the call site. So the friends query seeds
   from server data and skips the mount refetch: the page is a dynamic server component, so
   every navigation already re-renders it with fresh data, and mutations still refetch via
   `invalidateQueries`.
3. **No brand wordmark in the nav.** The product name is still TBD (README §1); "Search"
   doubles as the home link. The Vercel project URL hints at "Out of Ten" but that has never
   been confirmed — worth settling before launch.
4. **`Button` gained a `size` prop** (`default` | `sm`) — it only had `variant`.
5. **Google avatars allowed in `next.config.ts`** (`lh3.googleusercontent.com`), rendered with
   `unoptimized` like the existing `Poster` component.
6. `search-experience.tsx` lost its duplicate username/sign-out header, now that AppNav owns it.

### Verification

- `tsc --noEmit`, `eslint`, `next build` all clean; the route table lists all five new routes
  plus `/friends`, all dynamic.
- Migration replayed into PGlite: 13/13 (see above). The throwaway validation script was
  deleted after use — the live assertions live in the harness instead.
- **`scripts/verify-e2e.mjs` extended**: it now seeds three users (A/B/C) with their own
  session tokens, `api()` accepts a per-call `sessionToken`, and there are ~20 new checks —
  schema indexes (5), send/duplicate/self/unknown/401 guards, pending row shape,
  incoming visibility, accept (200 + row flips + no second row + idempotent re-accept),
  auto-accept on reverse request (exactly one row), requester-cannot-accept (403),
  decline/cancel/unfriend (row deleted, correct `action`), and discovery: finds by username,
  case-insensitive, excludes the searcher, empty under 2 characters, and **returns nothing for
  a known email address**.
- **Live verification is pending on the user's machine** — the sandbox has no DB/network
  egress, as in every previous session.

### Exact local steps for the user

1. `git pull` (branch `arena/01a0f881-self-project`).
2. `npx prisma migrate status` → expect `20261001090000_friends_feed_indexes` not yet applied.
3. `npx prisma migrate deploy` → applies the index change.
4. `npx prisma migrate status` → "Database schema is up to date!"
5. `npx prisma migrate dev` → drift check, expect "Already in sync". **If it wants to generate
   a new migration, the hand-written SQL drifted from the schema — report back.**
6. `npm run dev`, then `npm run verify:e2e` in a second terminal. Expect the previously passing
   23 checks plus the new friends/index checks (the 5 index checks are the ones that fail if
   the migration was not applied).
7. Manual: `/friends` → search your own second account's handle → send → accept from the other
   account.

### What happens next

Step 3: `lib/feed.ts` (grouping query + shared mapper), `GET /api/feed`, and `/feed` with
grouped franchise cards and snapshot pagination — then the Feed link joins the nav.
Step 4: profile grid + carousel permalink + privacy states (this is what consumes
`lib/visibility.ts`).

---

## 2026-10-01 (session 4, part 3) — drift incident: schema.prisma lost two `@@index` lines

### Symptom (user's machine, real Supabase database)

```
npx prisma migrate status   → 3 migrations found, 20261001090000_friends_feed_indexes not yet applied
npx prisma migrate deploy   → applied
npx prisma migrate status   → "Database schema is up to date!"
npx prisma migrate dev      → prompted "? Enter a name for the new migration:"
```

The user did **not** proceed — correct call, since letting it generate a migration would have
applied unreviewed SQL to the real database.

### Root cause — my bug, not Prisma's

`schema.prisma` at `e8ac984` declared the Post composite index but **not** the two Friendship
indexes, while the applied migration created all three. So the database had two indexes the
schema didn't declare, and `migrate dev` wanted to generate a migration to **drop** them.

How it happened: the sandbox reset mid-turn (documented behaviour — the local branch is reset to
the branch point and tracked files revert), and it reverted part of `schema.prisma` *after* I had
edited it. The two `edit_file` calls landed in the same message, but only the Post one survived
into the commit. Everything else looked healthy, which is why the commit went out broken:
- `tsc`, `eslint`, `next build` all pass — indexes are invisible to the type system;
- the PGlite validation asserted the indexes exist **in the replayed SQL**, and they did. It
  never compared the SQL against the schema, so it could not have caught this.

Why `migrate status` still said "up to date": it only compares the migrations directory against
`_prisma_migrations`. It never reads `schema.prisma`. Only `migrate dev` does — hence the two
commands disagreeing. That asymmetry is worth remembering: **`migrate status` is not a drift
check.**

### Fix

Restored the two declarations (`@@index([requesterId, status])`, `@@index([recipientId, status])`)
directly under `@@unique([requesterId, recipientId])`, with a comment naming the migration they
must stay in step with.

**No new migration is needed and nothing changes in the database.** The SQL already created those
indexes; `schema.prisma` was the side that was wrong. After pulling, `npx prisma migrate dev`
should report "Already in sync, no schema changes or pending changes found" and create nothing.

### New guard — `npm run verify:schema`

`scripts/verify-schema-drift.mjs` reproduces Prisma's comparison offline: it replays every
migration into PGlite and diffs the result against what `schema.prisma` actually declares —
**every** index (name, table, columns, order) and **every** column (name + nullability) for all
11 models. 28 indexes declared vs 28 built, all columns match → **39/39 pass**.

Verified it catches the exact bug: deleting the two Friendship `@@index` lines makes it fail with
`the migrations create it but schema.prisma does NOT declare it` for both (37 passed, 2 failed);
restoring them returns 39/39.

It needs `@electric-sql/pglite` (added to devDependencies — ~10 MB WASM, dev-only, nothing ships
to the client). Worth it because migrations in this repo are hand-written: `prisma migrate dev`
cannot run in the sandbox, since the schema engine is downloaded from `binaries.prisma.sh`, which
is blocked. The user is otherwise the one who discovers drift, on a real database.

Two parser notes, both of which produced false failures the first time and are now handled:
schema comments are stripped before parsing (a comment containing the literal `@@index([userId])`
read as a declaration), and relation/list fields are skipped when collecting columns.

**Process change: run `npm run verify:schema` before every migration is handed over.** Asserting
that SQL applies cleanly is not enough — the check has to be schema ↔ migration agreement.

### Prisma version — explicitly NOT upgrading

`migrate deploy` printed an update notice for `prisma@8.0.0-rc.19`. We are staying on the stable
**6.19.3** line, unchanged from session 1's decision: 8.x is a release candidate with a
restructured CLI, and Prisma 7+ removes `url = env("DATABASE_URL")` from schema files in favour of
`prisma.config.ts` + driver adapters. The notice is informational and is not part of this fix.
It can be silenced with `PRISMA_HIDE_UPDATE_MESSAGE=true` if it gets noisy.

### State after this fix

- 3 migrations, database up to date, no drift, no unapplied changes.
- Friends layer from part 2 is unaffected (indexes are transparent to the code).
- Local verification on the user's machine is still pending: `npm run verify:e2e`.

---

## 2026-10-01 (session 4, part 4) — two false alarms: e2e 401 root-caused, pglite was already committed

### 1. `verify:e2e` first check failed with 401 — my harness bug, NOT an auth regression

Symptom: `dev server reachable + session cookie accepted — status 401`, then every authed call
401'd, then the TV section crashed with `Cannot read properties of undefined (reading 'titleId')`.

**Root cause:** when I refactored single-user seeding into `seedUser()` (part 2), it generated its
own random session token. So the `Session` row for the primary user held `A.token`, while every
request sent the module-level `SESSION_TOKEN`. NextAuth looks up the cookie's token, finds no row,
and returns null → 401 on everything.

Proof (replayed against an in-memory Postgres): with the old behaviour, `SELECT … WHERE
sessionToken = <SESSION_TOKEN>` returns **0 rows**; after passing `SESSION_TOKEN` into
`seedUser`, it returns exactly one row for `verify_e2e`; an unknown token returns 0, so the new
check can actually fail rather than being a tautology.

**The app's auth is untouched and real sessions were never affected:**
- `git diff main HEAD -- lib/auth.ts` → empty; `app/api/search/route.ts` → empty;
- there is **no middleware file** anywhere in the repo (the user's first hypothesis);
- the new friends routes only *read* the session via `getServerSession(authOptions)`, the same
  call the pre-existing routes have always made;
- the DB-direct checks in the same run (the 5 index checks) all passed, because they don't go
  through the app — consistent with a cookie problem and not a server problem.

Fixes:
- `seedUser(db, email, username, token)` — A is now seeded with `SESSION_TOKEN` explicitly.
- **New setup assertion:** after seeding, the harness looks up the exact token it is about to send
  and requires one unexpired row. A token mismatch now fails at "Setup" with a readable message
  instead of masquerading as an app-wide auth failure 40 lines later.
- **Fail fast + diagnose:** if the dev-server probe is not 200, the harness stops and prints the
  three real candidates (missing/expired session row; `NEXTAUTH_SECRET` in `.env` not matching the
  one the running dev server loaded; `NEXTAUTH_URL` not matching the base URL), then cleans up its
  users. No more cascading crash three sections later.

### 2. `npm run verify:schema` could not run — nothing was missing; I measured wrong

**Correction to what I told the user earlier in this session.** I reported that the sandbox reset
had reverted `package.json` and dropped `@electric-sql/pglite` from the commit. That was wrong.
`git show HEAD:package.json` showed no pglite because **the sandbox's HEAD had been moved to a
different commit by a reset when I ran the check** — I was reading a snapshot commit, not the
branch tip. The commit `34f7ef3` does contain:
- `package.json` → `"@electric-sql/pglite": "^0.5.8"` and the `verify:schema` script;
- `package-lock.json` → 3 pglite entries;
- `schema.prisma` → both `Friendship` indexes;
- every friends-layer file.

Verified end-to-end the way the user would: copied **only** `package.json` + `package-lock.json`
out of the commit into an empty directory, ran `npm ci`, and ran the script → pglite installs
(446 packages) and the drift check passes **39/39**. So the user's `ERR_MODULE_NOT_FOUND` is simply
"the dependency was added after your last `npm install`" — `npm install` fixes it.

**Process lesson, and it is the real one behind both incidents this session:** the sandbox's git
HEAD moves on its own between tool calls (observed: `34f7ef3` in one call, back to `4b73436` in the
next, with the working tree intact). Working-tree state and committed state are therefore different
things here. **Verify with `git show <ref>:<file>` against an explicit ref, never by looking at the
file on disk or at `git status`.** I now do this on every commit before telling the user it's pushed
(the four greps against `origin/arena/…` after pushing are the new habit).

Recovery when a reset drops the branch to the branch point while the working tree keeps
everything: `git fetch origin && git reset --mixed origin/arena/01a0f881-self-project`, then
`git add -A && git commit`. (`--soft` leaves a stale index that makes a dozen files look deleted
while they sit on disk untracked; `--mixed` clears it — worth remembering, it cost a detour.)

### State after this

- `34f7ef3..5953610` pushed. Committed content re-verified at the remote tip (harness fix, pglite
  in package.json + lockfile, both Friendship indexes in schema.prisma).
- Database: `prisma migrate dev` reports "Already in sync" and
  `prisma migrate diff … --script` prints an empty migration — **the drift from part 3 is resolved
  and confirmed by the user on the real database.**
- `npm run verify:schema` → 39/39 (locally, and from a clean `npm ci`).
- Outstanding: `npm run verify:e2e` on the user's machine, now with the token fix.

---

## 2026-10-01 (session 4, part 5) — feed implemented (step 3 of §15)

Everything below is per the signed-off design (§12–§14): one card per franchise group, vertical
cards with an inline swipeable carousel, average rating + entry count, earliest-entry poster,
cards open on the entry that caused the bump, snapshot pagination.

### What was built

- **`lib/feed.ts`** — `getFriendFeed({ viewerId, snapshotAt, cursor, limit })`. The ordering pass
  is a single parameterised `$queryRaw` grouped by
  `COALESCE('g:' || franchiseGroupId, 'p:' || postId)` **and userId**, ordered by
  `MAX(createdAt) DESC`, keyset-paginated with a row comparison in `HAVING`. It returns each
  group's post ids via `array_agg`, and the second pass fetches those posts with ordinary typed
  Prisma (a primary-key fetch — it cannot pull in another user's posts that share a franchise
  group). Cards and averages are then assembled in TS.
- **`GET /api/feed`** — first call returns `snapshotAt`; later calls pass `snapshot` + opaque
  base64url `cursor` (`{lastActivityAt, groupKey}`). Malformed cursor → 400, no session → 401,
  limit clamped to 30.
- **`/feed`** — `app/(app)/feed/page.tsx` + `components/feed-list.tsx` (TanStack
  `useInfiniteQuery`) + `components/feed-card.tsx` + `components/entry-carousel.tsx`
  (CSS scroll-snap, no carousel library). "Feed" added to the nav.
- **`components/avatar.tsx`** — extracted from the friends manager so both screens share it.
- **`formatRelativeTime`** in `lib/utils.ts` and a `no-scrollbar` utility in `globals.css`.

### Decisions made while implementing

1. **Grouping is per (user, franchise).** Two users rating the same show get two cards — the SQL
   groups on `(group_key, userId)`, not on the franchise alone.
2. **`friendCount` is in the feed response**, so the UI can distinguish "you have no friends" from
   "your friends haven't posted" without a second request (and without coupling the feed to the
   nav's friends query).
3. **Relative timestamps are measured against `snapshotAt`**, not a client clock. Reading
   `Date.now()` during render trips `react-hooks/purity`, and `setState` in an effect trips
   `react-hooks/set-state-in-effect`; the server already sends the instant the feed was computed,
   which is both stable across renders and the moment the data was actually true.
4. **Cover poster** is the earliest entry's poster; if that title has none, it falls forward to the
   first poster that exists before using the README §3 placeholder.
5. **"N seasons" vs "N entries"** on the count badge: seasons when every entry in the group has a
   label, entries otherwise (a group mixing seasons and OVAs shouldn't claim "5 seasons").

### Verification

- **The raw SQL was validated against a real Postgres (PGlite) with seeded data — 12/12:** groups
  are per user + franchise; three seasons collapse into one card whose `post_ids` are newest-first;
  a standalone movie is its own card; two users in the same franchise get separate cards; a
  non-friend's post never appears; an older snapshot excludes newer posts (and the group's
  `MAX(createdAt)` correctly falls back to the next-newest entry); keyset page 2 continues without
  overlap or gaps. The temp script was deleted after use.
- `tsc`, `eslint`, `next build` clean; `/feed` and `/api/feed` in the route table.
- **`verify-e2e.mjs` extended with a live Feed section** (~20 checks): card-per-franchise,
  average to one decimal checked against the DB, newest-first ordering, **re-rating does not
  reorder and does not move `lastActivityAt`** (but does change the average), **a new season bumps
  the card to the top, grows it by one, and sets `focusEntryId` to the new entry**, a page pinned
  to an older snapshot does not see newer activity while a fresh one does, cursor pagination
  without repeats, malformed cursor → 400, unauthenticated → 401, your own posts never appear, a
  non-friend sees nothing, and `friendCount` 0 for someone with no friends.

### What happens next

Step 4: the profile — `/u/[username]` tile grid (newest activity first), the
`/u/[username]/p/[postId]` carousel permalink (which the feed's "Open" links already point at),
and the private-profile locked state, which is what finally consumes `lib/visibility.ts`.

---

## 2026-10-02 (session 5) — the profile grid and the permalink (step 4 of §15)

The last piece of the friends-and-feed milestone. `lib/visibility.ts` was written back in step 1
and had been waiting for a consumer ever since; this is the step that finally wires it in.

### What was built

- **`app/(app)/u/[username]/page.tsx`** — the Instagram-style tile grid. One square tile per
  franchise group, newest activity first, each tile linking to the group's *first* entry.
- **`app/(app)/u/[username]/p/[postId]/page.tsx`** — the carousel permalink. Same `FeedCard`
  component the feed uses, so there is one rendering of a grouped card in the app, not two.
- **`components/profile-grid.tsx`** — the tiles (server component, no client JS).
- **`components/profile-actions.tsx`** — Add friend / Request sent + Cancel / Accept + Decline /
  Friends + Remove, all through the existing `/api/friends/*` endpoints.
- **`components/use-friend-action.ts`** — the friend-request mutation, shared with
  `friends-manager.tsx` so both surfaces invalidate the same query keys.
- **`app/api/users/[username]/route.ts`** — profile summary only: `{ user, viewerRelation,
  canView }`.
- **`app/(app)/profile/page.tsx`** — `/profile` means "me", so it redirects to your own
  `/u/[username]` rather than keeping a second path that renders the same thing.
- **`lib/feed.ts`** refactored: `loadGroupCards()` is now shared by the feed and the profile, and
  `getProfileGroups()` + `getCardForPost()` are new read paths over it.

### Decisions

1. **The grid links to the group's first entry; a feed card links to whatever bumped it.** The
   feed's card sets `focusEntryId` to the new season so a bumped card opens on the thing that
   moved. A profile tile has no "thing that moved" — it opens at slide 1, which is what you want
   when you tap Naruto and expect to swipe from the beginning. `getCardForPost` takes the opposite
   default again: it sets `focusEntryId` to the entry in the URL, because that is the whole point
   of a permalink.
2. **A private post is a 404 for a non-friend, not a "locked" page.** Rendering "this post exists
   but is private" would confirm the post's existence, which is itself a leak. The profile *page*
   gets the locked state; a deep link to one of its posts does not.
3. **`/api/users/[username]` returns no posts at all.** It answers "who is this and may I look?",
   and nothing else. An endpoint that can't leak is easier to trust than one that can and
   currently doesn't.
4. **Visibility is checked before posts are ever fetched.** `loadProfileByUsername` does the lookup
   and the visibility decision in one call, so no code path can render a profile without having
   decided whether it is allowed to. On the permalink the ownership check and the visibility check
   both have to pass.
5. **The permalink shows a date, not a relative time.** It's a server component and can't read the
   clock during render (`react-hooks/purity`), and a locale-formatted date risks a hydration
   mismatch — so `YYYY-MM-DD`, identical on both sides. The feed gets relative times because it
   measures them against the snapshot the server already sent.

### Verification

- `tsc`, `eslint` clean; `next build` compiles and the route table gains `/u/[username]`,
  `/u/[username]/p/[postId]`, `/api/users/[username]` and `/profile`.
- **`verify-e2e.mjs` extended with a live Profile section** (~25 checks): one tile per franchise
  group and not one per entry (counted against a `GROUP BY` over the DB, deduped through a Set so
  the RSC flight payload can't skew it); the tile links to the group's canonical first entry; a
  public profile is visible to a non-friend while an anonymous visit is sent to sign-in; a
  permalink carries the *whole* franchise and opens on the slide it names, and a different entry
  deep-links to its own slide; a post under a username that doesn't own it is a 404; and the
  private profile — `canView: false` to a non-friend, locked state rendered, **zero tiles in the
  HTML**, post permalink 404s, a friend still sees everything, and a private account still shows up
  in its friends' feed.
- Tiles are counted from the HTML rather than the data layer on purpose: "the grid only renders one
  link per group" is a claim about what a visitor receives, and the flight payload duplication is
  exactly the kind of thing a data-layer test would miss.

### What happens next

Nothing is left in this milestone. Before starting the next one the design gets written up and
signed off first — that's the standing gate. Also still outstanding from earlier: the dev
credentials (Google OAuth client secret, Supabase DB password, `NEXTAUTH_SECRET`) need rotating
before launch, and `journey.md` is still missing the ~355 lines that `ad07b34` added and a
`--theirs` cherry-pick dropped.

---

## 2026-10-02 (session 5, part 2) — three e2e failures root-caused, one real UX gap fixed

User ran `verify:e2e` after pulling step 4: 103/106, with three failures. All three were
investigated to a mechanism before being touched. Two were bugs in the *tests I wrote*, not in the
app; one was a genuine gap the user found by hand.

### 1. "season 2 creates a second entry in the SAME group" — NOT a regression, a state leak

The user flagged this as top priority because it had passed at 55/55 and 80/80, and no
franchise-matching code changed this session. Correct instinct to check, but the grouping code was
never involved.

**Mechanism.** `cleanup()` deletes `Friendship`, `Post`, `Session` and `User` — and deliberately
nothing else. `Title`, `Entry` and `FranchiseGroup` are the shared catalog and outlive the run that
created them. The check asserted an *absolute* count over that shared table:

```sql
SELECT … FROM "Entry" WHERE "franchiseGroupId" = $1   -- expected rowCount = 2
```

So the count is "every season of this show any run ever created":

- run 1 (55/55): TV flow creates S1, S2 → 2 rows → passes.
- run 2 (80/80): feed section now also creates S3, S4. The TV check runs *before* that, so it
  still sees only S1, S2 left over from run 1 → 2 rows → passes.
- run 3 (103/106): now S3 and S4 exist from run 2 → 4 rows → **fails**.

That is exactly the observed pattern, and the same output confirms it independently: the carousel
was reported as carrying S1–S4 even though this run only posted S1, S2 and S3 in that group. The
number of failures (1) and the timing (third run, one run after the feed section started posting
extra seasons) both fit.

**Fix.** Count the entries *this user has posted* in the group (`Entry JOIN Post … WHERE
p."userId" = $2`) and assert those are seasons 1 and 2. That is the claim actually being made, and
it is stable no matter how many times the suite runs. It still fails if a new season lands in a
*different* group, which is the regression it exists to catch.

Audited every other count in the script for the same latent leak — the rest are keyed on unique
columns (`sourceKey`, `entryKey`, `(source, category, sourceId)`) or use a lower bound, so they are
idempotent. This was the only one.

### 2 & 3. The permalink focus checks — the app was right, my assertion was wrong

`getCardForPost` was not at fault. Before touching anything I server-rendered the real
`FeedCard` in a stubbed harness (tsc → `react-dom/server`) with focus set to Season 4. Output:

```html
<p class="text-sm font-medium">Breaking Bad<span class="text-muted-foreground"> · <!-- -->Season 4</span></p>
```

Season 4 — the correct slide. The chain `getCardForPost → buildCards(focusEntryId) → FeedCard`
works, which the passing data-layer check (`the carousel opens on the entry that caused the bump`)
had already implied, since both go through the same `buildCards` focus argument.

The test failed for a rendering reason: React puts each expression in its own element and marks the
join with an empty comment, so the sentence a visitor reads is never a contiguous string in the
HTML. My `readable()` helper stripped only comments, not tags.

**Fix.** Two clearly-named views instead of one, each with the job it is for:

- `readable(html)` — strip comment markers, keep attribute text (for the slide `aria-label`s).
- `textOf(html)` — strip comments *and* tags, leaving visible text (for the caption sentence).

Also tightened the two adjacent checks: "whole franchise present" now asserts each slide's
`aria-label="Season N"` rather than a loose substring, and a new check asserts the caption is *not*
showing some other season's label, so the positive check can't pass by coincidence.

### 4. Real gap: friends list had no route into a profile

The user found by hand that on `/friends` a friend's `@handle` was plain text. Fixed:
`PersonRow` in `friends-manager.tsx` now wraps the handle in a `Link` to `/u/[username]`, covering
friends, incoming and outgoing rows alike. Users without a username (onboarding incomplete) have no
profile URL and stay plain text. **Not covered by e2e** — the friends list is client-rendered from
`useQuery`, so it never appears in the server HTML; it needs a manual click-through.

### Verification

`tsc`, `eslint` clean. The build was not re-run (no app-code change beyond the one `Link`), and
**`verify:e2e` cannot run in this sandbox** — there is no `.env`/`DATABASE_URL` here, so the user
re-runs it locally.

### Correction: journey.md was never missing anything

Earlier notes claimed a `--theirs` cherry-pick had dropped ~355 lines that `ad07b34` added, and
that was carried forward as an outstanding task. It is **false**, and I should have re-checked it
before repeating it:

- `ad07b34` — "Log resolved friends/feed design decisions (sign-off round)" — added **75** lines to
  `journey.md`, not ~355. (The commit is unreachable in this clone now that the remote has been
  rewritten; the figure comes from the GitHub API.)
- Those 75 lines (§13 Resolved design, §14 Card spec, §15 Build order) are **already present** at
  lines 1050 / 1092 / 1116.
- Verified properly rather than by eye: `ad07b34:journey.md` is a contiguous substring of the
  current file, lines 1–1123 are byte-identical, and 0 of its 971 non-empty lines are missing.

Nothing to restore. The earlier note was based on inspecting a moved HEAD and an inflated estimate —
the same class of mistake as the pglite false alarm, so worth stating plainly rather than quietly
dropping.

### Correction to the entry above (same session)

One corroborating claim I made was wrong, and the mechanism deserves to rest only on things that
are actually true. I wrote that the output confirmed the leak because "the carousel was reported as
carrying S1–S4 even though this run only posted S1, S2 and S3". False — the feed section posts
season 4 as well (`seasonNumber: 4, rating: 6`, for the snapshot-pagination checks), so this run
created all four seasons and that observation proves nothing either way.

The root cause stands, on evidence that does hold:

- The check has three conjuncts: `post2.status === 200`, `entries.rowCount === 2`, and
  `postsForGroup.rows[0].n === 2`. The second counts every `Entry` row the group has *ever* held
  (shared catalog, never cleaned); the third counts this user's posts, which *is* scoped. A leak
  predicts the second fails while the third passes — and the failure is exactly that shape, since
  nothing else about the run changed.
- The timing fits: the check passed at 55/55 and 80/80 and failed on the third run, i.e. one run
  after the feed section started creating two extra seasons. A leak shows up one run late by
  definition; a real grouping regression would have appeared the moment the grouping code changed.
- No franchise-matching code changed this session, and the two checks that *are* scoped to the
  user's posts ("a franchise's seasons collapse into ONE card", "the card gains the new entry
  2 -> 3") both passed in the same run.

Everything else in the entry above is unaffected: the fix, the audit of the other counts, the two
permalink assertions, and the friends-list link.
