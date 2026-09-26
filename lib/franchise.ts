// Franchise / season grouping (approved design, README Section 5).
//
// TV (TMDb):     search returns parent shows → group key `tmdb:{showId}`,
//                entry key `tmdb:{showId}:s{seasonNumber}`.
// Anime (AniList): season/cour entries are separate media IDs linked only via
//                `relations`. Matching walks PREQUEL edges to the chain root
//                (tie-break: earliest air date, then lowest media id), giving
//                group key `anilist:{rootMediaId}` and entry key
//                `anilist:{mediaId}`. MOVIE/MUSIC formats stay standalone.
//
// Known limitation (logged): auto-grouping has no manual override yet — if the
// walk misclassifies an entry, there is no user-facing fix until that ships.

import { Category, type Entry, type Title } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ensureAniListMediaCached,
  upsertAniListTitle,
} from "@/lib/titles";
import { getAniListMedia, type AniListMedia } from "@/lib/anilist";

const MAX_WALK_DEPTH = 10;
const SEASON_ORDER: Record<string, number> = {
  WINTER: 1,
  SPRING: 2,
  SUMMER: 3,
  FALL: 4,
};

/** Anime formats that never join a franchise group (approved decision #1). */
const STANDALONE_ANIME_FORMATS = new Set(["MOVIE", "MUSIC"]);

const SEASON_NUMBER_PATTERNS = [
  /(\d+)\s*(?:st|nd|rd|th)\s+season/i, // "2nd Season"
  /season\s*(\d+)/i, // "Season 2"
  /cour\s*(\d+)/i, // "Cour 2"
  /part\s*(\d+)/i, // "Part 2"
  /(\d+)\s*期/, // "2期"
];

export function parseSeasonNumber(name: string): number | null {
  for (const pattern of SEASON_NUMBER_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (n >= 1 && n <= 99) return n;
    }
  }
  return null;
}

function deriveSeasonLabel(mediaName: string, rootName: string): string | null {
  if (mediaName.toLowerCase().startsWith(rootName.toLowerCase())) {
    const rest = mediaName
      .slice(rootName.length)
      .replace(/^[\s:–\-—]+/, "")
      .trim();
    return rest || null;
  }
  // Doesn't share the root's name (e.g. "Boruto: ..." under root "Naruto") —
  // keep the full title as the label.
  return mediaName;
}

function compareByAirDateThenId(a: AniListMedia, b: AniListMedia): number {
  const ay = a.seasonYear ?? Number.MAX_SAFE_INTEGER;
  const by = b.seasonYear ?? Number.MAX_SAFE_INTEGER;
  if (ay !== by) return ay - by;
  const as = SEASON_ORDER[a.season?.toUpperCase() ?? ""] ?? 99;
  const bs = SEASON_ORDER[b.season?.toUpperCase() ?? ""] ?? 99;
  if (as !== bs) return as - bs;
  return a.id - b.id;
}

/** Resolve (creating if needed) the Entry a new Post attaches to. */
export async function resolveEntryForTitle(
  title: Title,
  seasonNumber?: number | null
): Promise<Entry> {
  switch (title.category) {
    case Category.movie:
      return resolveMovieEntry(title);
    case Category.tv: {
      if (!seasonNumber) {
        throw new Error("A season number is required for TV shows.");
      }
      return resolveTvEntry(title, seasonNumber);
    }
    case Category.anime:
      return resolveAnimeEntry(title);
    default:
      throw new Error(`Unknown category: ${title.category}`);
  }
}

async function resolveMovieEntry(title: Title): Promise<Entry> {
  const entryKey =
    title.source === "tmdb"
      ? `tmdb:movie:${title.sourceId}`
      : `anilist:${title.sourceId}`;
  return upsertEntry({ entryKey, titleId: title.id });
}

async function resolveTvEntry(title: Title, seasonNumber: number): Promise<Entry> {
  const group = await upsertFranchiseGroup({
    sourceKey: `tmdb:${title.sourceId}`,
    name: title.name,
    category: Category.tv,
  });
  return upsertEntry({
    entryKey: `tmdb:${title.sourceId}:s${seasonNumber}`,
    titleId: title.id,
    franchiseGroupId: group.id,
    seasonNumber,
  });
}

async function resolveAnimeEntry(title: Title): Promise<Entry> {
  const mediaId = Number(title.sourceId);
  if (!Number.isFinite(mediaId)) {
    throw new Error(`Invalid AniList source id: ${title.sourceId}`);
  }

  // One fresh AniList fetch per anime post (user-initiated, not per keystroke)
  // so the standalone-format check and title parsing use current metadata.
  const fresh = await getAniListMediaSafe(mediaId);
  if (fresh && STANDALONE_ANIME_FORMATS.has(fresh.format ?? "")) {
    return upsertEntry({ entryKey: `anilist:${mediaId}`, titleId: title.id });
  }

  const root = await findAnimeRoot(mediaId, fresh);
  const group = await upsertFranchiseGroup({
    sourceKey: `anilist:${root.id}`,
    name: root.name,
    category: Category.anime,
  });

  const mediaName = title.name;
  const seasonNumber = parseSeasonNumber(mediaName);
  const seasonLabel =
    seasonNumber === null ? deriveSeasonLabel(mediaName, root.name) : null;

  return upsertEntry({
    entryKey: `anilist:${mediaId}`,
    titleId: title.id,
    franchiseGroupId: group.id,
    seasonNumber,
    seasonLabel,
  });
}

/**
 * Walk PREQUEL edges from a media to the root of its chain.
 * Tie-break for multiple prequels (approved decision #4): earliest air date,
 * then lowest media id. Cycle-safe via a visited set; depth-capped.
 */
async function findAnimeRoot(
  mediaId: number,
  initialFresh: AniListMedia | null
): Promise<{ id: number; name: string }> {
  const visited = new Set<number>([mediaId]);
  let currentId = mediaId;
  let currentRelations =
    initialFresh?.relations ??
    (await ensureAniListMediaCached(mediaId)).relations;

  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    const prequelIds = currentRelations
      .filter((r) => r.relationType === "PREQUEL")
      .map((r) => r.nodeId)
      .filter((id) => !visited.has(id));
    if (prequelIds.length === 0) break;

    let nextId: number;
    if (prequelIds.length === 1) {
      nextId = prequelIds[0];
    } else {
      // Rare branching: compare candidates by air date (fresh metadata only
      // fetched in this branch, then cached below for future walks).
      const candidates = (
        await Promise.all(prequelIds.map((id) => getAniListMediaSafe(id)))
      ).filter((m): m is AniListMedia => m !== null);
      if (candidates.length === 0) break;
      candidates.sort(compareByAirDateThenId);
      nextId = candidates[0].id;
    }

    visited.add(nextId);
    currentId = nextId;
    currentRelations = (await ensureAniListMediaCached(nextId)).relations;
  }

  const rootTitle = await prisma.title.findUniqueOrThrow({
    where: {
      source_sourceId: { source: "anilist", sourceId: String(currentId) },
    },
  });
  return { id: currentId, name: rootTitle.name };
}

async function getAniListMediaSafe(id: number): Promise<AniListMedia | null> {
  try {
    return await getAniListMedia(id);
  } catch {
    return null;
  }
}

async function upsertFranchiseGroup({
  sourceKey,
  name,
  category,
}: {
  sourceKey: string;
  name: string;
  category: Category;
}) {
  return prisma.franchiseGroup.upsert({
    where: { sourceKey },
    create: { name, category, sourceKey },
    update: {},
  });
}

async function upsertEntry({
  entryKey,
  titleId,
  franchiseGroupId,
  seasonNumber,
  seasonLabel,
}: {
  entryKey: string;
  titleId: string;
  franchiseGroupId?: string | null;
  seasonNumber?: number | null;
  seasonLabel?: string | null;
}): Promise<Entry> {
  return prisma.entry.upsert({
    where: { entryKey },
    create: { entryKey, titleId, franchiseGroupId, seasonNumber, seasonLabel },
    update: {},
  });
}

export { upsertAniListTitle };
