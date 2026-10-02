// ---------------------------------------------------------------------------
// The friends feed (design: journey.md §12–§14).
//
// A card is a franchise group *for one user* — not an individual Post. Adding a
// season creates a new Post, which raises the group's MAX(createdAt) and bumps
// the whole card; re-rating touches only `updatedAt`, so the card stays put.
// The data model is unchanged: Posts remain per-entry, the card is a read-time
// grouping.
//
// Pagination is snapshot-based. Ordering by MAX(createdAt) means a card can
// move while the client is scrolling: one below the cursor receives a new
// entry, jumps above it, and a naive keyset query then skips it forever. So the
// first page returns `snapshotAt`, and every later page is computed as of that
// instant — nothing can cross the cursor mid-session, and newer activity waits
// for a refresh.
//
// Why one raw query: Prisma has no way to express "group by franchise, order by
// MAX(createdAt), keyset-paginate", and doing it in JS means either N+1 or
// fetching an unbounded number of posts to fill 20 cards. The SQL is confined
// to "which groups, in what order"; every row that reaches the client is
// fetched and typed through Prisma afterwards.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getFriendIds } from "@/lib/friends";

export type FeedEntry = {
  postId: string;
  entryId: string;
  rating: number;
  caption: string | null;
  createdAt: string;
  updatedAt: string;
  /** "Season 2" / "OVA" / null when the entry has neither. */
  entryLabel: string | null;
  titleId: string;
  titleName: string;
  posterUrl: string | null;
  category: "movie" | "tv" | "anime";
  permalink: string;
};

export type FeedCard = {
  /** Stable within a snapshot: the franchise group id, or the post id for a
   *  standalone movie. Also the pagination tie-breaker. */
  groupKey: string;
  franchiseGroupId: string | null;
  groupName: string;
  category: "movie" | "tv" | "anime";
  user: { userId: string; username: string | null; name: string | null; image: string | null };
  /** Poster of the group's earliest entry — a stable "box set" cover. */
  coverPosterUrl: string | null;
  /** Mean of the user's ratings in this group, one decimal (display only). */
  averageRating: number;
  entryCount: number;
  /** Ordering key: when the group last received a new entry. */
  lastActivityAt: string;
  /** The entry that caused the bump — what the carousel opens on. */
  focusEntryId: string;
  latest: { entryLabel: string | null; rating: number; createdAt: string };
  /** Canonical watch order: seasonNumber asc, then first-rated. */
  entries: FeedEntry[];
};

export type FeedPage = {
  snapshotAt: string;
  /** Lets the UI tell "you have no friends yet" apart from "your friends
   *  haven't posted" without a second request. */
  friendCount: number;
  cards: FeedCard[];
  nextCursor: string | null;
};

export const DEFAULT_FEED_LIMIT = 20;
export const MAX_FEED_LIMIT = 30;

export function clampLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_FEED_LIMIT;
  return Math.min(n, MAX_FEED_LIMIT);
}

// ---------------------------------------------------------------------------
// Cursor: opaque to clients, so nobody can construct or depend on ordering
// internals. Ties on lastActivityAt are broken by groupKey, which is unique
// within a snapshot.
// ---------------------------------------------------------------------------

function encodeCursor(lastActivityAt: string, groupKey: string): string {
  return Buffer.from(JSON.stringify({ a: lastActivityAt, k: groupKey }), "utf8").toString(
    "base64url"
  );
}

function decodeCursor(raw: string): { at: Date; key: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      a?: unknown;
      k?: unknown;
    };
    if (typeof parsed.a !== "string" || typeof parsed.k !== "string") return null;
    const at = new Date(parsed.a);
    if (Number.isNaN(at.getTime())) return null;
    return { at, key: parsed.k };
  } catch {
    return null;
  }
}

function entryLabel(seasonNumber: number | null, seasonLabel: string | null): string | null {
  if (seasonNumber !== null) return `Season ${seasonNumber}`;
  return seasonLabel;
}

/** One decimal, trailing `.0` dropped: 8 not 8.0, 8.2 stays 8.2. */
function roundAverage(total: number, count: number): number {
  return Math.round((total / count) * 10) / 10;
}

type GroupRow = {
  group_key: string;
  user_id: string;
  last_activity_at: Date;
  entry_count: number;
  post_ids: string[];
};

export async function getFriendFeed({
  viewerId,
  snapshotAt,
  cursor,
  limit = DEFAULT_FEED_LIMIT,
}: {
  viewerId: string;
  snapshotAt: Date;
  cursor?: string | null;
  limit?: number;
}): Promise<FeedPage> {
  const friendIds = await getFriendIds(viewerId);
  if (friendIds.length === 0) {
    return { snapshotAt: snapshotAt.toISOString(), friendCount: 0, cards: [], nextCursor: null };
  }

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (cursor && !decoded) {
    throw new FeedError(400, "invalid_cursor", "Malformed cursor — start again without one.");
  }

  // Row comparison `(a, b) < (c, d)` = "strictly after the cursor" under
  // DESC ordering. It has to sit in HAVING, since last_activity_at is an
  // aggregate.
  const cursorClause = decoded
    ? Prisma.sql`
        HAVING (MAX(p."createdAt"), COALESCE('g:' || e."franchiseGroupId", 'p:' || p.id))
            < (${decoded.at}::timestamp(3), ${decoded.key}::text)`
    : Prisma.empty;

  const groupRows = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    SELECT
      COALESCE('g:' || e."franchiseGroupId", 'p:' || p.id) AS group_key,
      p."userId" AS user_id,
      MAX(p."createdAt") AS last_activity_at,
      COUNT(*)::int AS entry_count,
      array_agg(p.id ORDER BY p."createdAt" DESC) AS post_ids
    FROM "Post" p
    JOIN "Entry" e ON e.id = p."entryId"
    WHERE p."userId" = ANY(${friendIds}::text[])
      AND p."createdAt" <= ${snapshotAt}
    GROUP BY 1, 2
    ${cursorClause}
    ORDER BY last_activity_at DESC, group_key DESC
    LIMIT ${limit}
  `);

  if (groupRows.length === 0) {
    return {
      snapshotAt: snapshotAt.toISOString(),
      friendCount: friendIds.length,
      cards: [],
      nextCursor: null,
    };
  }

  // `post_ids` is already snapshot-filtered and complete for each group, so
  // this is a plain primary-key fetch — no way to pull in another user's posts
  // that happen to share a franchise group.
  const postIds = groupRows.flatMap((row) => row.post_ids);
  const posts = await prisma.post.findMany({
    where: { id: { in: postIds } },
    include: {
      user: { select: { id: true, username: true, name: true, image: true } },
      entry: {
        select: {
          id: true,
          seasonNumber: true,
          seasonLabel: true,
          franchiseGroupId: true,
          title: { select: { id: true, name: true, posterUrl: true, category: true } },
          franchiseGroup: { select: { id: true, name: true } },
        },
      },
    },
  });

  const postsById = new Map(posts.map((post) => [post.id, post]));
  const cards: FeedCard[] = [];

  for (const row of groupRows) {
    const groupPosts = row.post_ids
      .map((id) => postsById.get(id))
      .filter((post): post is NonNullable<typeof post> => Boolean(post));
    if (groupPosts.length === 0) continue;

    const first = groupPosts[0];
    const permalinkUser = first.user.username ?? first.user.id;

    const entries: FeedEntry[] = groupPosts.map((post) => ({
      postId: post.id,
      entryId: post.entry.id,
      rating: post.rating,
      caption: post.caption,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      entryLabel: entryLabel(post.entry.seasonNumber, post.entry.seasonLabel),
      titleId: post.entry.title.id,
      titleName: post.entry.title.name,
      posterUrl: post.entry.title.posterUrl,
      category: post.entry.title.category,
      permalink: `/u/${permalinkUser}/p/${post.id}`,
    }));

    // Canonical watch order for the carousel: season number, then first rated.
    // Entries with no season number sort last, among themselves by date.
    const seasonOf = (postId: string) =>
      postsById.get(postId)!.entry.seasonNumber ?? Number.MAX_SAFE_INTEGER;
    entries.sort((a, b) => {
      const seasonDiff = seasonOf(a.postId) - seasonOf(b.postId);
      if (seasonDiff !== 0) return seasonDiff;
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });

    // Cover: the earliest entry's poster. If that title has none, walk forward
    // for the first poster that exists before falling back to the placeholder.
    const coverPosterUrl =
      entries.find((entry) => entry.posterUrl)?.posterUrl ?? entries[0].posterUrl;

    const latestPost = groupPosts[0]; // array_agg ordered newest first
    const franchiseGroup = first.entry.franchiseGroup;

    cards.push({
      groupKey: row.group_key,
      franchiseGroupId: franchiseGroup?.id ?? null,
      groupName: franchiseGroup?.name ?? first.entry.title.name,
      category: first.entry.title.category,
      user: {
        userId: first.user.id,
        username: first.user.username,
        name: first.user.name,
        image: first.user.image,
      },
      coverPosterUrl,
      averageRating: roundAverage(
        groupPosts.reduce((sum, post) => sum + post.rating, 0),
        groupPosts.length
      ),
      entryCount: groupPosts.length,
      lastActivityAt: row.last_activity_at.toISOString(),
      focusEntryId: latestPost.entry.id,
      latest: {
        entryLabel: entryLabel(latestPost.entry.seasonNumber, latestPost.entry.seasonLabel),
        rating: latestPost.rating,
        createdAt: latestPost.createdAt.toISOString(),
      },
      entries,
    });
  }

  const last = cards[cards.length - 1];
  const nextCursor =
    groupRows.length === limit && last
      ? encodeCursor(last.lastActivityAt, last.groupKey)
      : null;

  return {
    snapshotAt: snapshotAt.toISOString(),
    friendCount: friendIds.length,
    cards,
    nextCursor,
  };
}

export class FeedError extends Error {
  constructor(
    readonly status: number,
    readonly code: "invalid_cursor" | "invalid_snapshot",
    message: string
  ) {
    super(message);
    this.name = "FeedError";
  }
}
