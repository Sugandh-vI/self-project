// ---------------------------------------------------------------------------
// Feed + profile reads (design: journey.md §12–§14).
//
// A card is a franchise group *for one user* — not an individual Post. Adding a
// season creates a new Post, which raises the group's MAX(createdAt) and bumps
// the whole card; re-rating touches only `updatedAt`, so the card stays put.
// The data model is unchanged: Posts remain per-entry, the card is a read-time
// grouping. The same grouping backs the friends feed and a profile's grid, so a
// franchise renders identically in both places.
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
import { countCommentsByPost } from "@/lib/comments";
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
  /** Comments on this entry. Shown as a badge; never affects feed ordering. */
  commentCount: number;
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
  /** The entry the carousel opens on: the one that caused the bump, or the
   *  first entry when a profile tile is opened (canonical order). */
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
/** Profile grids render everything up to this cap; "load more" can follow. */
export const PROFILE_GROUP_LIMIT = 50;

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

// ---------------------------------------------------------------------------
// Shared query shape
// ---------------------------------------------------------------------------

const POST_INCLUDE = {
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
} as const;

type PostWithRelations = Prisma.PostGetPayload<{ include: typeof POST_INCLUDE }>;

type GroupRow = {
  group_key: string;
  user_id: string;
  last_activity_at: Date;
  entry_count: number;
  /** Newest first — index 0 is the entry that caused the last bump. */
  post_ids: string[];
};

/**
 * Turns grouped rows + their posts into cards. Used by the feed, the profile
 * grid and the permalink, so all three render a franchise identically.
 * `focusEntryId` overrides the default focus (the newest entry).
 */
function buildCards(
  rows: GroupRow[],
  postsById: Map<string, PostWithRelations>,
  focusEntryId?: string,
  commentCounts: Map<string, number> = new Map()
): FeedCard[] {
  const cards: FeedCard[] = [];

  for (const row of rows) {
    const groupPosts = row.post_ids
      .map((id) => postsById.get(id))
      .filter((post): post is PostWithRelations => Boolean(post));
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
      commentCount: commentCounts.get(post.id) ?? 0,
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

    const latestPost = groupPosts[0];
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
      focusEntryId: focusEntryId ?? latestPost.entry.id,
      latest: {
        entryLabel: entryLabel(latestPost.entry.seasonNumber, latestPost.entry.seasonLabel),
        rating: latestPost.rating,
        createdAt: latestPost.createdAt.toISOString(),
      },
      entries,
    });
  }

  return cards;
}

/** The grouped ordering pass + the typed fetch of the rows it selected. */
async function loadGroupCards({
  userIds,
  snapshotAt,
  cursor,
  limit,
}: {
  userIds: string[];
  snapshotAt: Date;
  cursor?: string | null;
  limit: number;
}): Promise<{ rows: GroupRow[]; cards: FeedCard[] }> {
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

  const rows = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
    SELECT
      COALESCE('g:' || e."franchiseGroupId", 'p:' || p.id) AS group_key,
      p."userId" AS user_id,
      MAX(p."createdAt") AS last_activity_at,
      COUNT(*)::int AS entry_count,
      array_agg(p.id ORDER BY p."createdAt" DESC) AS post_ids
    FROM "Post" p
    JOIN "Entry" e ON e.id = p."entryId"
    WHERE p."userId" = ANY(${userIds}::text[])
      AND p."createdAt" <= ${snapshotAt}
    GROUP BY 1, 2
    ${cursorClause}
    ORDER BY last_activity_at DESC, group_key DESC
    LIMIT ${limit}
  `);

  if (rows.length === 0) return { rows, cards: [] };

  // `post_ids` is already snapshot-filtered and complete for each group, so
  // this is a plain primary-key fetch — no way to pull in another user's posts
  // that happen to share a franchise group.
  const posts = await prisma.post.findMany({
    where: { id: { in: rows.flatMap((row) => row.post_ids) } },
    include: POST_INCLUDE,
  });

  const commentCounts = await countCommentsByPost(posts.map((post) => post.id));

  return {
    rows,
    cards: buildCards(
      rows,
      new Map(posts.map((post) => [post.id, post])),
      undefined,
      commentCounts
    ),
  };
}

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
  const snapshotIso = snapshotAt.toISOString();

  if (friendIds.length === 0) {
    return { snapshotAt: snapshotIso, friendCount: 0, cards: [], nextCursor: null };
  }

  const { rows, cards } = await loadGroupCards({ userIds: friendIds, snapshotAt, cursor, limit });
  const last = cards[cards.length - 1];
  const nextCursor =
    rows.length === limit && last ? encodeCursor(last.lastActivityAt, last.groupKey) : null;

  return { snapshotAt: snapshotIso, friendCount: friendIds.length, cards, nextCursor };
}

/**
 * A profile's grid: the same grouping, scoped to one user, newest activity
 * first. Callers must have already passed the visibility check in
 * lib/visibility.ts — this function reads posts and nothing else.
 */
export async function getProfileGroups({
  userId,
  limit = PROFILE_GROUP_LIMIT,
}: {
  userId: string;
  limit?: number;
}): Promise<FeedCard[]> {
  const { cards } = await loadGroupCards({
    userIds: [userId],
    snapshotAt: new Date(),
    cursor: null,
    limit,
  });
  return cards;
}

/**
 * The card behind `/u/[username]/p/[postId]`, opened on that post's entry.
 * Returns the whole franchise group, which is the point of the permalink: it
 * deep-links to the right slide of a grouped card.
 */
export async function getCardForPost(postId: string): Promise<FeedCard | null> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: POST_INCLUDE,
  });
  if (!post) return null;

  const franchiseGroupId = post.entry.franchiseGroupId;
  const posts = franchiseGroupId
    ? // Siblings only: the same user's entries in the same franchise group.
      await prisma.post.findMany({
        where: { userId: post.userId, entry: { franchiseGroupId } },
        include: POST_INCLUDE,
      })
    : [post];

  const newestFirst = posts
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const row: GroupRow = {
    group_key: franchiseGroupId ? `g:${franchiseGroupId}` : `p:${post.id}`,
    user_id: post.userId,
    last_activity_at: newestFirst[0].createdAt,
    entry_count: newestFirst.length,
    post_ids: newestFirst.map((current) => current.id),
  };

  const commentCounts = await countCommentsByPost(posts.map((current) => current.id));

  const [card] = buildCards(
    [row],
    new Map(posts.map((current) => [current.id, current])),
    post.entry.id,
    commentCounts
  );
  return card ?? null;
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
