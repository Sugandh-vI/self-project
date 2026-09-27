// Cache-first title search (README Sections 4 & 7):
// one category tab → exactly one source; local Postgres cache is searched
// first, and the external source is only hit when the cache is thin, with
// new results cached for next time.

import { type Category, type Source, type Title } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAniListMedia,
  pickAniListName,
  pickAniListPoster,
  searchAniList,
  type AniListMedia,
} from "@/lib/anilist";
import { searchTmdb } from "@/lib/tmdb";

export type TitleSearchResult = {
  titleId: string;
  name: string;
  category: Category;
  posterUrl: string | null;
  source: Source;
  sourceId: string;
};

/** How many cached hits are enough to skip the external API entirely. */
const CACHE_HIT_THRESHOLD = 3;

export async function searchTitles(
  query: string,
  category: Category
): Promise<{ results: TitleSearchResult[]; degraded?: string }> {
  const q = query.trim();
  if (q.length < 2) return { results: [] };

  // 1) Local cache first.
  const cached = await prisma.title.findMany({
    where: { category, name: { contains: q, mode: "insensitive" } },
    take: 20,
    orderBy: { createdAt: "desc" },
  });
  if (cached.length >= CACHE_HIT_THRESHOLD) {
    return { results: cached.map(toResult) };
  }

  // 2) Cache is thin — fall back to the category-matched external source.
  //    Only the external lookup may degrade gracefully: a database failure
  //    here is a real error and must surface, not masquerade as "showing
  //    cached results only" (that masking hid the Supabase pool exhaustion).
  let fresh: Title[];
  if (category === "anime") {
    let media: AniListMedia[];
    try {
      media = await searchAniList(q);
    } catch (error) {
      return { results: cached.map(toResult), degraded: describe(error) };
    }
    fresh = await Promise.all(media.map(upsertAniListTitle));
  } else {
    let hits: Awaited<ReturnType<typeof searchTmdb>>;
    try {
      hits = await searchTmdb(category, q);
    } catch (error) {
      return { results: cached.map(toResult), degraded: describe(error) };
    }
    fresh = await Promise.all(
      hits.map((hit) => upsertTmdbTitle(category, hit))
    );
  }
  return { results: mergeResults(fresh, cached) };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Search failed.";
}

function toResult(title: Title): TitleSearchResult {
  return {
    titleId: title.id,
    name: title.name,
    category: title.category,
    posterUrl: title.posterUrl,
    source: title.source,
    sourceId: title.sourceId,
  };
}

/** Fresh external results first, then cached rows we haven't seen yet. */
function mergeResults(
  fresh: Title[],
  cached: Title[]
): TitleSearchResult[] {
  const seen = new Set(fresh.map((t) => t.id));
  return [...fresh, ...cached.filter((t) => !seen.has(t.id))].map(toResult);
}

export async function upsertTmdbTitle(
  category: "movie" | "tv",
  hit: { sourceId: string; name: string; posterUrl: string | null }
): Promise<Title> {
  return prisma.title.upsert({
    where: {
      source_category_sourceId: {
        source: "tmdb",
        category,
        sourceId: hit.sourceId,
      },
    },
    create: {
      name: hit.name,
      category,
      posterUrl: hit.posterUrl,
      source: "tmdb",
      sourceId: hit.sourceId,
    },
    // Keep the first cached version; titles are stable enough for the MVP.
    update: {},
  });
}

/** Cache an AniList media as a Title, including its relation edges so the
 *  anime franchise root-walk can stay local. */
export async function upsertAniListTitle(media: AniListMedia): Promise<Title> {
  const title = await prisma.title.upsert({
    where: {
      source_category_sourceId: {
        source: "anilist",
        category: "anime",
        sourceId: String(media.id),
      },
    },
    create: {
      name: pickAniListName(media),
      category: "anime",
      posterUrl: pickAniListPoster(media),
      source: "anilist",
      sourceId: String(media.id),
    },
    update: {},
  });

  for (const edge of media.relations) {
    await prisma.aniListRelation.upsert({
      where: {
        fromTitleId_toSourceId_relationType: {
          fromTitleId: title.id,
          toSourceId: String(edge.nodeId),
          relationType: edge.relationType,
        },
      },
      create: {
        fromTitleId: title.id,
        toSourceId: String(edge.nodeId),
        relationType: edge.relationType,
      },
      update: {},
    });
  }

  return title;
}

/** Look up a cached AniList media (with its relation edges), fetching and
 *  caching it from AniList on first encounter. Used by the franchise walk. */
export async function ensureAniListMediaCached(
  mediaId: number
): Promise<{ title: Title; relations: { relationType: string; nodeId: number }[] }> {
  const existing = await prisma.title.findUnique({
    where: {
      source_category_sourceId: {
        source: "anilist",
        category: "anime",
        sourceId: String(mediaId),
      },
    },
    include: { aniListRelations: true },
  });
  if (existing) {
    return {
      title: existing,
      relations: existing.aniListRelations.map((r) => ({
        relationType: r.relationType,
        nodeId: Number(r.toSourceId),
      })),
    };
  }
  const media = await getAniListMedia(mediaId);
  if (!media) {
    throw new Error(`AniList media ${mediaId} not found.`);
  }
  const title = await upsertAniListTitle(media);
  return {
    title,
    relations: media.relations.map((r) => ({
      relationType: r.relationType,
      nodeId: r.nodeId,
    })),
  };
}

