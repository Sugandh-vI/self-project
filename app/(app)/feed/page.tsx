import { requireUser } from "@/lib/auth";
import { FeedList } from "@/components/feed-list";

// Authed + session-dependent — never prerender.
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  await requireUser();

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Feed</h1>
      <FeedList />
    </main>
  );
}
