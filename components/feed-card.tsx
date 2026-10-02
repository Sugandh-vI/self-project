"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { EntryCarousel } from "@/components/entry-carousel";
import { formatRelativeTime } from "@/lib/utils";
import type { FeedCard as FeedCardData, FeedEntry } from "@/lib/feed";

/**
 * Relative when we have a reference instant, otherwise the plain UTC date.
 * The permalink page is a server component and cannot read the clock during
 * render, and a locale-formatted date there would risk a hydration mismatch —
 * `YYYY-MM-DD` is identical on both sides.
 */
function timeLabel(iso: string, now: number | null): string {
  return now === null ? iso.slice(0, 10) : formatRelativeTime(iso, now);
}

/**
 * One card = one franchise group for one user (a standalone movie is just a
 * one-entry group). The carousel is swipeable inline, and the caption below it
 * follows the slide you are on.
 */
export function FeedCard({ card, now }: { card: FeedCardData; now: number | null }) {
  const [activeEntry, setActiveEntry] = useState<FeedEntry | null>(null);

  const entry =
    activeEntry ??
    card.entries.find((candidate) => candidate.entryId === card.focusEntryId) ??
    card.entries[0];

  const handle = card.user.username ?? card.user.name ?? "someone";
  const everyEntryIsASeason = card.entries.every((candidate) => candidate.entryLabel);

  return (
    <article className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex items-center gap-3">
        <Avatar user={card.user} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <Link href={`/u/${card.user.username ?? card.user.userId}`} className="hover:underline">
              {handle}
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            {timeLabel(card.lastActivityAt, now)}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 gap-1.5 text-xs">
          <span
            className="rounded-md bg-muted px-2 py-1 font-medium tabular-nums"
            title={`Your average across ${card.entryCount} ${card.entryCount === 1 ? "entry" : "entries"}`}
          >
            avg {card.averageRating}
          </span>
          {card.entryCount > 1 && (
            <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
              {card.entryCount} {everyEntryIsASeason ? "seasons" : "entries"}
            </span>
          )}
        </div>
      </header>

      <EntryCarousel
        entries={card.entries}
        focusEntryId={card.focusEntryId}
        onActiveChange={setActiveEntry}
      />

      <div className="mt-3">
        <p className="text-sm font-medium">
          {card.groupName}
          {entry.entryLabel && (
            <span className="text-muted-foreground"> · {entry.entryLabel}</span>
          )}
        </p>
        <p className="mt-0.5 text-sm">
          <span className="font-semibold tabular-nums">{entry.rating}</span>
          <span className="text-muted-foreground">/10</span>
          <span className="text-muted-foreground">
            {" · "}
            {timeLabel(entry.createdAt, now)}
            {entry.updatedAt > entry.createdAt && " · edited"}
          </span>
          {/* A count, never an ordering signal — comments don't bump the feed. */}
          {entry.commentCount > 0 && (
            <span className="text-muted-foreground">
              {" · "}
              {entry.commentCount} {entry.commentCount === 1 ? "comment" : "comments"}
            </span>
          )}
        </p>
        {entry.caption && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {entry.caption}
          </p>
        )}
        <Link
          href={entry.permalink}
          className="mt-2 inline-block text-xs text-muted-foreground hover:underline"
        >
          Open
        </Link>
      </div>
    </article>
  );
}
