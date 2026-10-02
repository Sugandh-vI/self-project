"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { FeedCard } from "@/components/feed-card";
import type { FeedPage } from "@/lib/feed";

type PageParam = { snapshot: string; cursor: string } | null;

async function fetchFeed(pageParam: PageParam): Promise<FeedPage> {
  const url = pageParam
    ? `/api/feed?snapshot=${encodeURIComponent(pageParam.snapshot)}&cursor=${encodeURIComponent(pageParam.cursor)}`
    : "/api/feed";
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to load feed (${res.status})`);
  }
  return (await res.json()) as FeedPage;
}

export function FeedList() {
  const feed = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam }) => fetchFeed(pageParam),
    initialPageParam: null as PageParam,
    // The snapshot comes from the page that produced the cursor — that is what
    // keeps a bumped card from being skipped between pages.
    getNextPageParam: (lastPage) =>
      lastPage.nextCursor
        ? { snapshot: lastPage.snapshotAt, cursor: lastPage.nextCursor }
        : null,
  });

  const cards = feed.data?.pages.flatMap((page) => page.cards) ?? [];
  const friendCount = feed.data?.pages[0]?.friendCount ?? 0;
  // Relative timestamps are measured from the snapshot the server computed the
  // feed at, not from a client clock: it is stable across renders (reading the
  // clock during render breaks React's purity rules) and it is the moment the
  // data was actually true.
  const now = feed.data ? Date.parse(feed.data.pages[0].snapshotAt) : null;

  if (feed.isPending) {
    return <p className="text-sm text-muted-foreground">Loading your friends’ activity…</p>;
  }

  if (feed.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {feed.error instanceof Error ? feed.error.message : "Couldn’t load the feed."}
      </p>
    );
  }

  if (friendCount === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">Your feed is empty because you have no friends yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add someone by username and their ratings will show up here.
        </p>
        <Link href="/friends">
          <Button className="mt-4" size="sm">
            Find friends
          </Button>
        </Link>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing here yet — when your friends rate something, it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cards.map((card) => (
        // groupKey is unique per user+franchise within a snapshot.
        <FeedCard key={card.groupKey} card={card} now={now} />
      ))}

      {feed.hasNextPage && (
        <div className="flex justify-center py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
          >
            {feed.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
