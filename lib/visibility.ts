// ---------------------------------------------------------------------------
// Profile visibility — the ONLY place allowed to decide whether a viewer may
// see a user's content (design: journey.md §1).
//
// Every surface calls this: profile pages (server components), /api/users/[…],
// and the feed. The UI must never be the thing enforcing privacy — a locked
// profile has to return no data over HTTP, not just render differently.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { getRelation, type Relation } from "@/lib/friends";

export type ViewerRelation = Relation;

export type Visibility = {
  /** How the viewer stands with the profile owner. */
  relation: ViewerRelation;
  /** True when the viewer may see posts, ratings and captions. */
  canView: boolean;
};

export type ProfileSummary = {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
  isPrivate: boolean;
  createdAt: string;
};

/**
 * The rule, kept pure so it can be reasoned about (and tested) on its own:
 * you always see yourself, friends see everything, everyone else sees a public
 * profile and nothing of a private one.
 */
export function canViewContent(
  relation: ViewerRelation,
  target: { isPrivate: boolean }
): boolean {
  if (relation === "self" || relation === "friends") return true;
  return !target.isPrivate;
}

export async function visibilityFor(
  viewerId: string | null,
  target: { id: string; isPrivate: boolean }
): Promise<Visibility> {
  const relation = await getRelation(viewerId, target.id);
  return { relation, canView: canViewContent(relation, target) };
}

/**
 * Lookup + visibility in one call, so no caller can fetch a profile and forget
 * to check it. Returns null when there is no such username (or the user never
 * finished onboarding — they have no profile URL to visit).
 */
export async function loadProfileByUsername(
  username: string,
  viewerId: string | null
): Promise<{ user: ProfileSummary; visibility: Visibility } | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      name: true,
      image: true,
      isPrivate: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  return {
    user: { ...user, createdAt: user.createdAt.toISOString() },
    visibility: await visibilityFor(viewerId, user),
  };
}
