"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Poster } from "@/components/poster";
import { CreatePostDialog } from "@/components/create-post-dialog";
import type { TitleSearchResult } from "@/lib/titles";

const TABS = [
  { id: "movie", label: "Movie" },
  { id: "tv", label: "TV Show" },
  { id: "anime", label: "Anime" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SearchExperience() {
  const [tab, setTab] = useState<TabId>("movie");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [active, setActive] = useState<TitleSearchResult | null>(null);

  // Debounce keystrokes so we never hit the API per character
  // (README Section 7 caching requirement).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["search", tab, debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/search?category=${tab}&q=${encodeURIComponent(debouncedQuery)}`
      );
      if (!res.ok) throw new Error("Search failed");
      return (await res.json()) as {
        results: TitleSearchResult[];
        degraded?: string;
      };
    },
    enabled: debouncedQuery.length >= 2,
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {/* Identity + sign-out now live in AppNav, which wraps every authed page. */}
      <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${TABS.find((t) => t.id === tab)?.label.toLowerCase()}…`}
        className="mt-4 flex h-11 w-full rounded-md border border-input bg-background px-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {searchQuery.data?.degraded && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {searchQuery.data.degraded} Showing cached results only.
        </p>
      )}

      <div className="mt-6">
        {debouncedQuery.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Type at least 2 characters to search.
          </p>
        ) : searchQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : searchQuery.isError ? (
          <p className="text-sm text-destructive">Search failed.</p>
        ) : searchQuery.data.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-5">
            {searchQuery.data.results.map((r) => (
              <li key={r.titleId}>
                <button
                  type="button"
                  onClick={() => setActive(r)}
                  className="group block w-full text-left"
                >
                  <Poster
                    name={r.name}
                    posterUrl={r.posterUrl}
                    className="transition-transform group-hover:scale-[1.02]"
                  />
                  <p className="mt-1.5 line-clamp-2 text-xs font-medium">
                    {r.name}
                  </p>
                  <p className="text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Rate this
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <CreatePostDialog
          key={active.titleId}
          result={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
