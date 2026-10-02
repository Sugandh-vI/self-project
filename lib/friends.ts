// ---------------------------------------------------------------------------
// Friend requests (design: journey.md §5, §13).
//
// One `Friendship` row per pair, directionally stored as requester -> recipient.
// The row is the single source of truth for "are these two connected", so every
// read has to consider BOTH directions (an accepted row can have the viewer on
// either side). `getRelation`, `getFriendIds` and `listFriendships` all do that.
//
// Concurrency note: the unique constraint is directional, so two simultaneous
// sends in opposite directions can both insert. The window is tiny and the
// duplicate is harmless — reads prefer an accepted row (status 'accepted' sorts
// before 'pending') and both accept and delete clear any reverse leftover. A
// transaction would close the window but holds a pooled connection for its
// duration, and the pool is deliberately capped at 5 (lib/prisma-pool.ts), so
// the trade is: an idempotent-on-retry write path instead of a held connection.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type Relation = "self" | "friends" | "outgoing" | "incoming" | "none";

export type PersonSummary = {
  userId: string;
  username: string | null;
  name: string | null;
  image: string | null;
};

export type FriendRequestSummary = {
  friendshipId: string;
  person: PersonSummary;
  createdAt: string;
};

export type FriendsOverview = {
  friends: PersonSummary[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
};

/** Typed failure so route handlers can map straight to a status code. */
export class FriendsError extends Error {
  constructor(
    readonly status: number,
    readonly code:
      | "invalid"
      | "not_found"
      | "self"
      | "already_friends"
      | "already_requested"
      | "forbidden",
    message: string
  ) {
    super(message);
    this.name = "FriendsError";
  }
}

const PERSON_SELECT = {
  id: true,
  username: true,
  name: true,
  image: true,
} as const;

type PersonRow = {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
};

function toPerson(row: PersonRow): PersonSummary {
  return {
    userId: row.id,
    username: row.username,
    name: row.name,
    image: row.image,
  };
}

/** Both directions of one specific pair, in a single predicate. */
function pairWhere(a: string, b: string) {
  return {
    OR: [
      { requesterId: a, recipientId: b },
      { requesterId: b, recipientId: a },
    ],
  };
}

/** Every row the user is on either side of. */
function involving(userId: string) {
  return { OR: [{ requesterId: userId }, { recipientId: userId }] };
}

/**
 * How the viewer stands with the target user. `friends` covers an accepted row
 * in either direction; `outgoing`/`incoming` describe a pending one.
 */
export async function getRelation(
  viewerId: string | null,
  targetUserId: string
): Promise<Relation> {
  if (!viewerId) return "none";
  if (viewerId === targetUserId) return "self";

  const row = await prisma.friendship.findFirst({
    where: pairWhere(viewerId, targetUserId),
    // 'accepted' sorts before 'pending', so a stray duplicate row in the
    // opposite direction can never downgrade an established friendship.
    orderBy: { status: "asc" },
    select: { requesterId: true, status: true },
  });

  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === viewerId ? "outgoing" : "incoming";
}

/**
 * The row connecting two users, if any — used when a page needs the friendship
 * id (accept / decline / cancel) rather than just the relation. Prefers an
 * accepted row, matching getRelation.
 */
export async function getFriendshipBetween(
  viewerId: string,
  otherUserId: string
): Promise<{ id: string; status: "pending" | "accepted"; requesterId: string } | null> {
  return prisma.friendship.findFirst({
    where: pairWhere(viewerId, otherUserId),
    orderBy: { status: "asc" },
    select: { id: true, status: true, requesterId: true },
  });
}

/** Ids of everyone the user is friends with — the feed's membership filter. */
export async function getFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: "accepted", ...involving(userId) },
    select: { requesterId: true, recipientId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.recipientId : r.requesterId));
}

/** Friends + pending requests in both directions, for /friends and the nav badge. */
export async function listFriendships(userId: string): Promise<FriendsOverview> {
  const rows = await prisma.friendship.findMany({
    where: involving(userId),
    include: { requester: { select: PERSON_SELECT }, recipient: { select: PERSON_SELECT } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const overview: FriendsOverview = { friends: [], incoming: [], outgoing: [] };
  // A user can only appear once in `friends`; the seen-set also collapses the
  // rare duplicate row described at the top of this file.
  const seen = new Set<string>();

  for (const row of rows) {
    const iAmRequester = row.requesterId === userId;
    const other = toPerson(iAmRequester ? row.recipient : row.requester);

    if (row.status === "accepted") {
      if (seen.has(other.userId)) continue;
      seen.add(other.userId);
      overview.friends.push(other);
      continue;
    }

    const entry: FriendRequestSummary = {
      friendshipId: row.id,
      person: other,
      createdAt: row.createdAt.toISOString(),
    };
    if (iAmRequester) overview.outgoing.push(entry);
    else overview.incoming.push(entry);
  }

  return overview;
}

/**
 * Send a request. If the target already sent us one, that pending row is
 * flipped to accepted instead of creating a second row (approved behaviour).
 */
export async function sendFriendRequest(
  fromUserId: string,
  toUserId: string
): Promise<{ status: "pending" | "accepted"; friendshipId: string }> {
  if (fromUserId === toUserId) {
    throw new FriendsError(400, "self", "You can't send a friend request to yourself.");
  }

  const target = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true, username: true },
  });
  if (!target) {
    throw new FriendsError(404, "not_found", "No such user.");
  }

  const existing = await prisma.friendship.findFirst({
    where: pairWhere(fromUserId, toUserId),
    orderBy: { status: "asc" },
    select: { id: true, requesterId: true, status: true },
  });

  if (existing?.status === "accepted") {
    throw new FriendsError(409, "already_friends", "You're already friends.");
  }
  if (existing) {
    if (existing.requesterId === fromUserId) {
      throw new FriendsError(409, "already_requested", "Request already sent.");
    }
    // Reverse pending request -> auto-accept rather than piling up a second row.
    const accepted = await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: "accepted" },
      select: { id: true },
    });
    return { status: "accepted", friendshipId: accepted.id };
  }

  try {
    const created = await prisma.friendship.create({
      data: { requesterId: fromUserId, recipientId: toUserId },
      select: { id: true },
    });
    return { status: "pending", friendshipId: created.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Lost a race with an identical insert. The row that won is the answer.
      const winner = await prisma.friendship.findFirstOrThrow({
        where: { requesterId: fromUserId, recipientId: toUserId },
        select: { id: true },
      });
      return { status: "pending", friendshipId: winner.id };
    }
    throw error;
  }
}

/** Accept an incoming request. Only the recipient may do this. */
export async function acceptFriendRequest(
  actorId: string,
  friendshipId: string
): Promise<void> {
  const row = await prisma.friendship.findUnique({
    where: { id: friendshipId },
    select: { id: true, requesterId: true, recipientId: true, status: true },
  });
  if (!row) throw new FriendsError(404, "not_found", "Request not found.");
  if (row.recipientId !== actorId) {
    throw new FriendsError(403, "forbidden", "Only the recipient can accept this request.");
  }
  if (row.status === "accepted") return; // idempotent

  await prisma.friendship.update({
    where: { id: row.id },
    data: { status: "accepted" },
  });
  await clearReverseDuplicate(row.requesterId, row.recipientId, row.id);
}

/**
 * Withdraw a pending request (requester), decline one (recipient), or unfriend
 * (either side, accepted). All three are the same row deletion — see journey
 * §5 for why there is no `rejected` status.
 */
export async function deleteFriendship(
  actorId: string,
  friendshipId: string
): Promise<{ action: "declined" | "cancelled" | "unfriended" }> {
  const row = await prisma.friendship.findUnique({
    where: { id: friendshipId },
    select: { id: true, requesterId: true, recipientId: true, status: true },
  });
  if (!row) throw new FriendsError(404, "not_found", "Request not found.");
  if (row.requesterId !== actorId && row.recipientId !== actorId) {
    throw new FriendsError(403, "forbidden", "That isn't your request.");
  }

  const action =
    row.status === "accepted"
      ? "unfriended"
      : row.requesterId === actorId
        ? "cancelled"
        : "declined";

  await prisma.friendship.delete({ where: { id: row.id } });
  await clearReverseDuplicate(row.requesterId, row.recipientId, row.id);

  return { action };
}

/** Removes a leftover row pointing the other way, if the concurrency window
 *  described at the top of this file ever produced one. */
async function clearReverseDuplicate(
  requesterId: string,
  recipientId: string,
  keepId: string
): Promise<void> {
  await prisma.friendship.deleteMany({
    where: {
      id: { not: keepId },
      requesterId: recipientId,
      recipientId: requesterId,
    },
  });
}

/**
 * Find people to add. Username substring only, by design — no email lookup, so
 * the app never becomes an email-enumeration surface (journey §13, Q4).
 * Users who haven't finished onboarding (no username) are not findable.
 */
export async function searchUsers(query: string, viewerId: string): Promise<PersonSummary[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await prisma.user.findMany({
    where: {
      id: { not: viewerId },
      username: { not: null, contains: q, mode: "insensitive" },
    },
    select: PERSON_SELECT,
    orderBy: { username: "asc" },
    take: 20,
  });

  return rows.map(toPerson);
}
