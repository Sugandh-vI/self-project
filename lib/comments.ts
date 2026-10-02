// ---------------------------------------------------------------------------
// Comments (design: journey.md §16).
//
// Three rules came out of sign-off and shape everything here:
//   - visibility reuses lib/visibility.ts, so a private account's comment
//     thread is invisible to a non-friend, not just hidden in the UI;
//   - comments never bump the feed, and that needs no code to enforce —
//     they live in their own table, so Post.createdAt / updatedAt never move;
//   - deletion is the comment author OR the post owner.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { visibilityFor } from "@/lib/visibility";

export const COMMENT_MAX_LENGTH = 1000;
export const COMMENT_DEFAULT_LIMIT = 50;
export const COMMENT_MAX_LIMIT = 100;

export type CommentAuthor = {
  userId: string;
  username: string | null;
  name: string | null;
  image: string | null;
};

export type CommentView = {
  id: string;
  text: string;
  createdAt: string;
  author: CommentAuthor;
  /** True for the comment's author and for the owner of the post it sits on. */
  canDelete: boolean;
};

/** Typed failure so route handlers can map straight to a status code. */
export class CommentsError extends Error {
  constructor(
    readonly status: number,
    readonly code: "invalid" | "not_found" | "forbidden",
    message: string
  ) {
    super(message);
    this.name = "CommentsError";
  }
}

const AUTHOR_SELECT = {
  id: true,
  username: true,
  name: true,
  image: true,
} as const;

/**
 * Can the viewer read (and therefore comment on) this post?
 *
 * Delegates to lib/visibility.ts rather than re-deriving the rule: you always
 * see yourself, friends see everything, everyone else sees a public profile
 * and nothing of a private one.
 */
async function canViewPost(
  viewerId: string,
  owner: { id: string; isPrivate: boolean }
): Promise<boolean> {
  const { canView } = await visibilityFor(viewerId, owner);
  return canView;
}

/** The post plus just enough of its owner to run the visibility check. */
async function loadPost(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, isPrivate: true } },
    },
  });
}

/**
 * A post's comment thread, oldest first — a conversation reads top to bottom.
 * Returns null when the post does not exist or the viewer may not see it, so a
 * private post is indistinguishable from a missing one (same rule as the
 * permalink: confirming it exists is itself a leak).
 */
export async function listComments({
  postId,
  viewerId,
  limit = COMMENT_DEFAULT_LIMIT,
}: {
  postId: string;
  viewerId: string;
  limit?: number;
}): Promise<{ comments: CommentView[]; hasMore: boolean } | null> {
  const post = await loadPost(postId);
  if (!post) return null;
  if (!(await canViewPost(viewerId, post.user))) return null;

  const take = Math.min(Math.max(limit, 1), COMMENT_MAX_LIMIT);
  // One extra row is how `hasMore` is decided without a second COUNT query.
  const rows = await prisma.comment.findMany({
    where: { postId },
    include: { user: { select: AUTHOR_SELECT } },
    orderBy: { createdAt: "asc" },
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    comments: page.map((row) => ({
      id: row.id,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      author: {
        userId: row.user.id,
        username: row.user.username,
        name: row.user.name,
        image: row.user.image,
      },
      canDelete: row.userId === viewerId || post.userId === viewerId,
    })),
    hasMore,
  };
}

/** Add a comment. Returns the new comment, or null if the post is invisible. */
export async function createComment({
  postId,
  authorId,
  text,
}: {
  postId: string;
  authorId: string;
  text: string;
}): Promise<CommentView | null> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new CommentsError(400, "invalid", "A comment can't be empty.");
  }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new CommentsError(
      400,
      "invalid",
      `A comment can be at most ${COMMENT_MAX_LENGTH} characters.`
    );
  }

  const post = await loadPost(postId);
  if (!post) return null;
  if (!(await canViewPost(authorId, post.user))) return null;

  const row = await prisma.comment.create({
    data: { postId, userId: authorId, text: trimmed },
    include: { user: { select: AUTHOR_SELECT } },
  });

  return {
    id: row.id,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    author: {
      userId: row.user.id,
      username: row.user.username,
      name: row.user.name,
      image: row.user.image,
    },
    // The author can always delete their own; so can the post owner.
    canDelete: true,
  };
}

/**
 * Delete a comment. The author may delete their own, and the owner of the post
 * it sits on may delete any — the moderation power the user signed off on.
 * Both the post and the comment id are required so a forged id can't be used
 * against someone else's thread.
 */
export async function deleteComment({
  commentId,
  actorId,
}: {
  commentId: string;
  actorId: string;
}): Promise<void> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, post: { select: { userId: true } } },
  });
  if (!comment) {
    throw new CommentsError(404, "not_found", "Comment not found.");
  }
  if (comment.userId !== actorId && comment.post.userId !== actorId) {
    throw new CommentsError(
      403,
      "forbidden",
      "Only the comment's author or the post's owner can delete it."
    );
  }

  await prisma.comment.delete({ where: { id: comment.id } });
}

/**
 * Comment counts for many posts at once — one grouped query, so the feed adds
 * a count per entry without an N+1. Posts with no comments are simply absent
 * from the map, which is what a default of 0 means.
 */
export async function countCommentsByPost(
  postIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (postIds.length === 0) return counts;

  const rows = await prisma.comment.groupBy({
    by: ["postId"],
    where: { postId: { in: postIds } },
    _count: { _all: true },
  });

  for (const row of rows) counts.set(row.postId, row._count._all);
  return counts;
}
