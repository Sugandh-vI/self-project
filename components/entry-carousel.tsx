"use client";

import { useEffect, useRef, useState } from "react";
import { Poster } from "@/components/poster";
import type { FeedEntry } from "@/lib/feed";

/**
 * Horizontally swipeable strip of a franchise's entries, CSS scroll-snap so it
 * works with touch, trackpad and the arrow buttons without a carousel library.
 *
 * `focusEntryId` picks the slide it opens on. From the feed that is the entry
 * that caused the bump; from a profile tile it is the first entry.
 */
export function EntryCarousel({
  entries,
  focusEntryId,
  onActiveChange,
}: {
  entries: FeedEntry[];
  focusEntryId: string | null;
  onActiveChange?: (entry: FeedEntry) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const focusIndex = focusEntryId
    ? entries.findIndex((entry) => entry.entryId === focusEntryId)
    : -1;
  const initialIndex = focusIndex >= 0 ? focusIndex : 0;

  // Jump to the focused slide once, on mount (no dependency on `active`, or
  // swiping would snap back).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    setActive(initialIndex);
    track.scrollLeft = initialIndex * track.clientWidth;
  }, [initialIndex]);

  // Fires only when the slide actually changes; `entries` holds stable
  // references (it comes from the query cache), so this cannot loop.
  const activeEntry = entries[active];
  useEffect(() => {
    onActiveChange?.(activeEntry);
  }, [activeEntry, onActiveChange]);

  function scrollTo(index: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
  }

  if (entries.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(event) => {
          const track = event.currentTarget;
          if (track.clientWidth === 0) return;
          const index = Math.round(track.scrollLeft / track.clientWidth);
          setActive(Math.min(Math.max(index, 0), entries.length - 1));
        }}
      >
        {entries.map((entry) => (
          <div
            key={entry.entryId}
            className="w-full shrink-0 snap-center px-0.5"
            aria-label={entry.entryLabel ?? entry.titleName}
            role="group"
          >
            <div className="relative">
              <Poster name={entry.titleName} posterUrl={entry.posterUrl} />
              <span className="absolute right-2 top-2 rounded-md bg-background/90 px-2 py-1 text-sm font-semibold tabular-nums shadow-sm">
                {entry.rating}
                <span className="text-xs font-normal text-muted-foreground">/10</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {entries.length > 1 && (
        <>
          <CarouselButton
            direction="left"
            disabled={active === 0}
            onClick={() => scrollTo(active - 1)}
          />
          <CarouselButton
            direction="right"
            disabled={active === entries.length - 1}
            onClick={() => scrollTo(active + 1)}
          />
          <div className="mt-2 flex justify-center gap-1.5">
            {entries.map((entry, index) => (
              <button
                key={entry.entryId}
                type="button"
                aria-label={`Go to ${entry.entryLabel ?? entry.titleName}`}
                aria-current={index === active}
                onClick={() => scrollTo(index)}
                className={`h-1.5 rounded-full transition-all ${
                  index === active ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CarouselButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous entry" : "Next entry"}
      className={`absolute top-1/2 hidden -translate-y-1/2 rounded-full border bg-background/90 p-1.5 shadow-sm transition-opacity sm:block ${
        direction === "left" ? "left-1" : "right-1"
      } ${disabled ? "pointer-events-none opacity-0" : "opacity-80 hover:opacity-100"}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <polyline points={direction === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
      </svg>
    </button>
  );
}
