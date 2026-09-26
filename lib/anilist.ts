// AniList client (README Section 7 — anime). Public GraphQL API, no key needed.
// Relations are fetched alongside search results so the franchise root-walk
// can run against our cache instead of calling AniList repeatedly.

const ANILIST_URL =
  process.env.ANILIST_API_URL ?? "https://graphql.anilist.co";

const MEDIA_FIELDS = `
  id
  format
  seasonYear
  season
  title { romaji english native }
  coverImage { extraLarge large color }
  relations { edges { relationType node { id } } }
`;

export type AniListMedia = {
  id: number;
  format: string | null; // TV | TV_SHORT | MOVIE | SPECIAL | OVA | ONA | MUSIC
  seasonYear: number | null;
  season: string | null; // WINTER | SPRING | SUMMER | FALL
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    color: string | null;
  };
  relations: { relationType: string; nodeId: number }[];
};

async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`AniList request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function mapMedia(m: {
  id: number;
  format: string | null;
  seasonYear: number | null;
  season: string | null;
  title: { romaji: string; english: string | null; native: string | null };
  coverImage: {
    extraLarge: string | null;
    large: string | null;
    color: string | null;
  };
  relations: {
    edges: { relationType: string; node: { id: number } }[];
  };
}): AniListMedia {
  return {
    id: m.id,
    format: m.format,
    seasonYear: m.seasonYear,
    season: m.season,
    title: m.title,
    coverImage: m.coverImage,
    relations: (m.relations?.edges ?? []).map((e) => ({
      relationType: e.relationType,
      nodeId: e.node.id,
    })),
  };
}

/** Search anime. Results include relation edges so they can be cached. */
export async function searchAniList(query: string): Promise<AniListMedia[]> {
  const data = await anilistQuery<{
    data?: { Page?: { media?: Parameters<typeof mapMedia>[0][] } };
  }>(
    `query ($search: String) {
       Page(perPage: 20) {
         media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
           ${MEDIA_FIELDS}
         }
       }
     }`,
    { search: query }
  );
  return (data.data?.Page?.media ?? []).map(mapMedia);
}

/** Fetch a single anime by AniList media id (used during root walks). */
export async function getAniListMedia(id: number): Promise<AniListMedia | null> {
  const data = await anilistQuery<{ data?: { Media?: Parameters<typeof mapMedia>[0] } }>(
    `query ($id: Int) {
       Media(id: $id, type: ANIME) {
         ${MEDIA_FIELDS}
       }
     }`,
    { id }
  );
  return data.data?.Media ? mapMedia(data.data.Media) : null;
}

export function pickAniListName(media: AniListMedia): string {
  return (
    media.title.english?.trim() ||
    media.title.romaji?.trim() ||
    media.title.native?.trim() ||
    `AniList #${media.id}`
  );
}

export function pickAniListPoster(media: AniListMedia): string | null {
  return media.coverImage.extraLarge ?? media.coverImage.large ?? null;
}
