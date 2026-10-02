import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadProfileByUsername } from "@/lib/visibility";
import { getCardForPost } from "@/lib/feed";
import { FeedCard } from "@/components/feed-card";

// Authed + session-dependent — never prerender.
export const dynamic = "force-dynamic";

/**
 * The canonical permalink: `/u/[username]/p/[postId]`. It resolves the post's
 * franchise group and renders the grouped card with that entry focused, which
 * is the README §5 "deep-link back to the correct entry/slide". A standalone
 * movie renders as a one-slide card through the same component.
 *
 * `now` is null, so the card shows the entry's date instead of a relative
 * time: this is a server component, and reading the clock during render breaks
 * React's purity rules (the feed gets away with it because its relative times
 * are measured against the snapshot the server already sent).
 */
export default async function PostPage({
  params,
}: {
  params: Promise<{ username: string; postId: string }>;
}) {
  const viewer = await requireUser();
  const { username, postId } = await params;

  const card = await getCardForPost(postId);
  if (!card) notFound();

  // The post must belong to the profile in the URL, and the viewer must be
  // allowed to see that profile's content.
  const profile = await loadProfileByUsername(username.toLowerCase(), viewer.id);
  if (!profile || profile.user.id !== card.user.userId) notFound();

  // A private profile's post is a 404 for a non-friend, not a "this exists but
  // is private" page — confirming a post exists is itself a leak.
  if (!profile.visibility.canView) notFound();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <Link
        href={`/u/${profile.user.username}`}
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← @{profile.user.username}
      </Link>

      <FeedCard card={card} now={null} />
    </main>
  );
}
