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