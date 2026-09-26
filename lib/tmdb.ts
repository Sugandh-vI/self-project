// TMDb client (README Section 7 — movies + TV shows).
// Supports both a v3 API key (passed as ?api_key=) and a v4 read access token
// (passed as a Bearer header), since both are commonly handed out.

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

function tmdbInit(): RequestInit {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error("TMDB_API_KEY is not set — needed for movie/TV search.");
  }
  // v4 read access tokens are JWTs; v3 keys are short opaque strings.
  if (key.startsWith("eyJ")) {
    return { headers: { Authorization: `Bearer ${key}` } };
  }
  return {};
}

function tmdbUrl(path: string, params: Record<string, string> = {}): string {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const key = process.env.TMDB_API_KEY;
  if (key && !key.startsWith("eyJ")) url.searchParams.set("api_key", key);
  return url.toString();
}

export function tmdbPosterUrl(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}/w500${posterPath}` : null;
}

export type TmdbHit = {
  sourceId: string;
  name: string;
  posterUrl: string | null;
};

/** Search TMDb movies or TV shows. TV results are parent shows (all seasons
 *  share the show id) — this is what makes franchise grouping deterministic. */
export async function searchTmdb(
  category: "movie" | "tv",
  query: string
): Promise<TmdbHit[]> {
  const res = await fetch(
    tmdbUrl(`/search/${category}`, {
      query,
      include_adult: "false",
      language: "en-US",
      page: "1",
    }),
    { ...tmdbInit(), next: { revalidate: 3600 } }
  );
  if (!res.ok) {
    throw new Error(`TMDb search failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    results?: { id: number; title?: string; name?: string; poster_path: string | null }[];
  };
  return (data.results ?? []).map((r) => ({
    sourceId: String(r.id),
    name: (category === "movie" ? r.title : r.name) ?? "Untitled",
    posterUrl: tmdbPosterUrl(r.poster_path),
  }));
}

export type TmdbSeason = {
  seasonNumber: number;
  name: string;
  episodeCount: number;
};

/** Season list for a TV show — used by the post-creation season picker. */
export async function getTmdbSeasons(showId: string): Promise<TmdbSeason[]> {
  const res = await fetch(tmdbUrl(`/tv/${showId}`, { language: "en-US" }), {
    ...tmdbInit(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`TMDb show lookup failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as {
    seasons?: { season_number: number; name: string; episode_count: number }[];
  };
  return (data.seasons ?? [])
    .filter((s) => s.season_number > 0)
    .map((s) => ({
      seasonNumber: s.season_number,
      name: s.name || `Season ${s.season_number}`,
      episodeCount: s.episode_count,
    }));
}
