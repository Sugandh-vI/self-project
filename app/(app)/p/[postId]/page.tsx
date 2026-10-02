import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadProfileByUsername } from "@/lib/visibility";
import { prisma } from "@/lib/prisma";

// Authed + session-dependent — never prerender.
export const dynamic = "force-dynamic";

/**
 * A stable resolver for permalinks: `/p/[postId]` → the current canonical
 * `/u/[username]/p/[postId]`.
 *
 * Usernames are editable (§17), so a canonical `/u/<old-handle>/p/…` link
 * shared before a rename would 404 forever. This route makes those links
 * survive: it looks up whoever owns the post today and redirects. Canonical
 * URLs stay username-based because they read better in a browser; this is the
 * fallback that keeps old ones alive.
 *
 * A post the viewer may not see 404s here too, so this can't be used to probe
 * for the existence of someone else's ratings.
 */
export default async function PermalinkRedirect({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const viewer = await requireUser();
  const { postId } = await params;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      user: { select: { username: true, id: true, isPrivate: true } },
    },
  });
  if (!post) notFound();

  // Someone who never finished onboarding has no username and therefore no
  // profile URL to redirect to — and they aren't findable in the app anyway.
  if (!post.user.username) notFound();

  const profile = await loadProfileByUsername(post.user.username.toLowerCase(), viewer.id);
  if (!profile || !profile.visibility.canView) notFound();

  redirect(`/u/${post.user.username}/p/${post.id}`);
}
