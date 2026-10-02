import Image from "next/image";
import Link from "next/link";
import type { FeedCard } from "@/lib/feed";

/**
 * Instagram-style tile grid: one square tile per franchise group, newest
 * activity first. Tapping a tile opens the permalink for the group's *first*
 * entry in canonical order, so the carousel starts at slide 1 — which is the
 * deliberate difference from the feed, where a card opens on whatever bumped
 * it.
 *
 * Server component: no client JS, and the tiles are real links, so every card
 * is addressable and the back button works.
 */
export function ProfileGrid({ groups }: { groups: FeedCard[] }) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing rated yet — once they rate something, it shows up here.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-1 sm:gap-2">
      {groups.map((group) => {
        const entry = group.entries[0];
        const labelled = group.entries.every((candidate) => candidate.entryLabel);

        return (
          <li key={group.groupKey}>
            <Link
              href={entry.permalink}
              className="group relative block"
              aria-label={`${group.groupName}${
                group.entryCount > 1
                  ? `, ${group.entryCount} ${labelled ? "seasons" : "entries"}`
                  : ""
              }, average ${group.averageRating}`}
            >
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                {group.coverPosterUrl ? (
                  <Image
                    src={group.coverPosterUrl}
                    alt={group.groupName}
                    fill
                    sizes="(max-width: 640px) 33vw, 200px"
                    // Posters are 2:3; crop to square from the top so titles
                    // and faces survive.
                    className="object-cover object-top"
                    unoptimized
                  />
                ) : (
                  // README Section 3 fallback: no poster, no broken image.
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/80 to-primary p-2 text-center">
                    <span className="line-clamp-4 text-xs font-semibold text-primary-foreground">
                      {group.groupName}
                    </span>
                  </div>
                )}
              </div>

              <span className="absolute right-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm">
                {group.averageRating}
              </span>
              {group.entryCount > 1 && (
                <span className="absolute left-1 top-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] shadow-sm">
                  {group.entryCount}
                  {labelled ? "s" : "e"}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
