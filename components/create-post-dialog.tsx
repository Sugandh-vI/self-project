"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/poster";
import type { TitleSearchResult } from "@/lib/titles";

type Season = { seasonNumber: number; name: string; episodeCount: number };

const RATINGS = Array.from({ length: 11 }, (_, i) => i);

// Rendered with a `key` of the title id so switching titles remounts the
// dialog with fresh state (no reset-effect needed).
export function CreatePostDialog({
  result,
  onClose,
}: {
  result: TitleSearchResult;
  onClose: () => void;
}) {
  const isTv = result.category === "tv";
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const seasonsQuery = useQuery({
    queryKey: ["seasons", result.titleId],
    queryFn: async () => {
      const res = await fetch(`/api/titles/${result.titleId}/seasons`);
      if (!res.ok) throw new Error("Failed to load seasons");
      return (await res.json()) as { seasons: Season[] };
    },
    enabled: isTv,
  });

  const canSubmit =
    rating !== null && (!isTv || seasonNumber !== null) && !submitting;

  async function submit() {
    if (rating === null) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleId: result.titleId,
          seasonNumber,
          rating,
          caption,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `Failed (${res.status})`);
      }
      setStatus("Posted!");
      setTimeout(onClose, 600);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Rate ${result.name}`}
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{result.name}</h2>
            <p className="text-sm text-muted-foreground capitalize">
              {result.category}
            </p>
          </div>
          <Poster
            name={result.name}
            posterUrl={result.posterUrl}
            className="w-16 shrink-0"
          />
        </div>

        {isTv && (
          <div className="mt-4">
            <label htmlFor="season" className="text-sm font-medium">
              Season
            </label>
            {seasonsQuery.isPending && (
              <p className="text-sm text-muted-foreground">
                Loading seasons…
              </p>
            )}
            {seasonsQuery.isError && (
              <p className="text-sm text-destructive">
                Couldn&apos;t load seasons from TMDb.
              </p>
            )}
            {seasonsQuery.data && (
              <select
                id="season"
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={seasonNumber ?? ""}
                onChange={(e) =>
                  setSeasonNumber(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
              >
                <option value="">Select a season…</option>
                {seasonsQuery.data.seasons.map((s) => (
                  <option key={s.seasonNumber} value={s.seasonNumber}>
                    {s.name} ({s.episodeCount} episodes)
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="mt-4">
          <span className="text-sm font-medium">Your rating</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RATINGS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-pressed={rating === n}
                className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                  rating === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="caption" className="text-sm font-medium">
            Caption <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="caption"
            rows={3}
            maxLength={2000}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What did you think?"
            className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          {status && (
            <span
              className={`text-sm ${
                status === "Posted!" ? "text-green-600" : "text-destructive"
              }`}
            >
              {status}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit} type="button">
            {submitting ? "Posting…" : "Post rating"}
          </Button>
        </div>
      </div>
    </div>
  );
}
