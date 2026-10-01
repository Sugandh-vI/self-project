import { requireUser } from "@/lib/auth";
import { listFriendships } from "@/lib/friends";
import { FriendsManager } from "@/components/friends-manager";

// Authed + session-dependent — never prerender.
export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const user = await requireUser();
  // Rendered on the server so the lists are on screen immediately; the client
  // component refetches the same data through /api/friends after each action.
  const initial = await listFriendships(user.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Friends</h1>
      <FriendsManager initial={initial} username={user.username} />
    </main>
  );
}
