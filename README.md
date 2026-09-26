# Project: [Name TBD] — Social Rating App for Movies, TV & Anime

## 1. What this app is

A social platform for people who watch movies, TV shows, anime, and cartoons and want to
rate what they watch on a **numeric 0–10 scale** — not stars, not "thumbs up." Ratings are
shared with friends in a feed, similar in visual language to Instagram, but the content of
each post is a title (movie/show/anime), a poster/cover image, a rating, and an optional
caption instead of a photo.

The core belief driving this product: rating something is more satisfying and more useful
when it's social. Seeing what your friends actually watched and how they rated it is more
valuable than a global average score from strangers (which is why we are intentionally
**not** pulling in IMDb or any third-party aggregate score for the MVP).

## 2. Core purpose (why someone opens this app)

- Log and numerically rate everything they watch (movies, TV, anime, cartoons).
- Build a public or private history/checklist of what they've watched.
- See friends' activity — what they watched, what they rated it, what they said about it.
- Discover what to watch next through friends' taste rather than algorithmic strangers.
- Even with zero friends added yet, the app should be useful solo as a personal watch log —
  this is the fallback hook that solves the cold-start problem.

## 3. The core object: a "Post"

A post is created whenever a user searches for a title and submits a rating (comment is
optional). Visually and structurally, a post is:

- **Poster/cover image** of the movie/show/anime (primary visual anchor, Instagram-style).
- **The user's numeric rating** (0–10), shown prominently.
- **Optional caption/comment.**
- **Comments from other users** are supported underneath, same as a normal social post.

### Missing poster fallback
If a title has no poster/cover image available from the source API, the post displays a
placeholder card instead of a broken image — just the title name + the user's rating, on a
solid background (color can be tied to genre or just a default brand color; avoid plain
white/grey so it doesn't look like an error state).

## 4. Search UX

Search is **category-routed**, not merged across sources. The user selects one of three tabs
before searching:

- **Movie**
- **TV Show**
- **Anime**

Selecting a category routes the query to exactly one backend source (see Section 7), which
avoids duplicate/conflicting results for the same title coming back from multiple APIs with
different posters or metadata. Do not attempt to merge or deduplicate results across
categories — this was explicitly decided against.

## 5. Franchise / season grouping (TV shows AND anime)

This applies to **both TV shows and anime** (not anime-only) — any title with multiple
seasons, cours, OVAs, or related entries.

- A franchise (e.g. "Naruto," "Breaking Bad") is represented as **one grouped post** on a
  user's profile — a single swipeable card containing multiple entries (one per
  season/OVA/etc. that the user has rated).
- Each individual season/entry still has **its own rating, its own optional caption, and its
  own timestamp** — it is not one shared rating for the whole franchise.
- **Movies are standalone** and do not use this grouping — a movie is just one post, no
  parent/child structure needed.

### Feed behavior (important — this was explicitly decided)
When a user adds a new season/entry to an existing grouped post (e.g. they finish Season 2
after having already posted Season 1), **this counts as fresh activity and bumps to the top
of friends' feeds** as a new feed event — it is not a silent update. The feed event should
deep-link back to the correct entry/slide within the grouped post.

Implication for the data model: there needs to be a clear separation between:
- the **parent franchise/post** (what shows on the profile as one card), and
- **individual rated entries** underneath it (each of which independently generates a feed
  event when created).

## 6. Rating granularity (MVP scope)

**Whole series/season level only for the MVP.** Do NOT build episode-level rating yet — this
was explicitly descoped to keep the first version buildable. It may be considered later once
the core loop is validated.

## 7. Content data sources

Three category-specific APIs, matched 1:1 to the three search tabs:

- **Movies + TV shows:** [TMDb (The Movie Database)](https://www.themoviedb.org/documentation/api)
- **Anime:** [AniList API](https://anilist.co/graphiql) (GraphQL)

Do not query multiple sources for the same search — one tab, one source, as described in
Section 4.

### Caching requirement
Do not call TMDb/AniList live on every keystroke of a search. Titles that have been looked
up should be cached into our own Postgres database (title, poster URL, source ID, category,
parent franchise reference if applicable) and searched against locally first, refreshing/
adding new titles as needed. This is also where franchise/season grouping logic actually
lives, since neither external API models that relationship the way we need it.

### Licensing
TMDb is free for non-commercial use but requires attribution, and a commercial license is
required once the app is monetized. AniList has its own attribution/rate-limit terms. These
must be respected in the final product (visible attribution, correct usage tier).

## 8. Users, auth, and profiles

- **Login:** Google/Gmail only for MVP (via NextAuth.js). Additional providers (Apple, email)
  may be added later but are out of scope for now.
- **Where user data lives:** Login/session data is handled by NextAuth and persisted into our
  own Postgres database (via the Prisma adapter) — there is no separate/external identity
  store. Google is only used for the identity check itself.
- **Username:** chosen by the user during onboarding (after first Google login), stored on
  the User table.
- **Profile picture (DP):** defaults to the user's Google account photo, but the user can
  upload their own image from their device instead. Uploaded images are stored via
  Cloudinary; the database stores only the resulting URL.
- **Public/private profiles:** users can set their profile/watch history to public or
  private.
- **Friends:** connection via friend request (send/accept), similar to standard social apps.
  Friend status determines feed visibility.

## 9. Explicit non-goals for MVP (things we decided NOT to build yet)

- No IMDb or third-party aggregate rating display.
- No episode-level rating.
- No mobile app yet — laptop/web first. Mobile (React Native/Expo) comes after the core web
  loop is validated, reusing the same backend API routes.
- No merged/cross-category search results.
- No login providers beyond Google for now.

## 10. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + Backend | **Next.js (React, TypeScript), App Router** | One framework for UI and API routes in a single repo; extremely well-represented in AI coding agent training data, meaning fewer mistakes and less hand-holding when an AI agent is doing the implementation. |
| Styling | **Tailwind CSS + shadcn/ui** | Fast, clean, Instagram-style UI without hand-written CSS; shadcn/ui provides accessible pre-built components that are easy for an agent to wire up correctly and look good by default. |
| Database | **PostgreSQL via Supabase** | Managed Postgres with built-in auth/storage extras, generous free tier, very common pairing with Next.js. |
| ORM | **Prisma** | Type-safe queries; schema file is a clear, readable definition of the whole data model (User, Title, Season/Entry, Post, Rating, Comment, Friendship) — easy for both a human and an agent to reason about. |
| Auth | **NextAuth.js (Auth.js), Google provider** | Handles Gmail login out of the box; built to add more providers later without restructuring. |
| Image handling | **Cloudinary** | Normalizes inconsistent poster sizes/aspect ratios from different APIs on the fly via URL parameters; also stores user-uploaded profile pictures. |
| Content APIs | **TMDb** (movies/TV), **AniList** (anime) | Category-matched sources per Section 7. |
| Client data fetching | **TanStack Query** | Handles loading/caching/refetching for a snappy feed experience. |
| Hosting | **Vercel** | Same team as Next.js; deploys automatically from GitHub on every push; generous free tier for MVP. |
| Mobile (future) | **React Native (Expo)** | Reuses the same Next.js API routes as the backend — no backend rebuild needed when mobile work starts. |

Everything in this stack is JavaScript/TypeScript end-to-end (frontend, backend, and data
layer), which keeps the codebase consistent and easier for a single coding agent to work
across without context-switching languages.

## 11. Core data model (conceptual — refine into actual Prisma schema during implementation)

- **User** — id, email, username, profile picture URL, public/private flag, created date.
- **Title** — id, name, category (movie/tv/anime), poster URL, source (tmdb/anilist), source ID.
- **FranchiseGroup** — id, name, category (tv/anime only; not used for movies) — the parent
  grouping for multi-season content.
- **Entry** — id, title reference, optional franchise group reference (season number/label if
  applicable).
- **Post** — id, user reference, entry reference, rating (0–10), optional caption, timestamp.
  Each Post is what generates a feed event.
- **Comment** — id, post reference, user reference, text, timestamp.
- **Friendship** — id, requester, recipient, status (pending/accepted).

## 12. Status

This README reflects the ideation and planning phase only. No code has been written yet.
See `journey.md` for a running log of implementation progress, decisions made during
development, and what should happen next — that file should be read first at the start of
every new coding session, and updated at the end of every session.