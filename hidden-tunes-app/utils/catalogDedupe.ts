import { normalizeCatalogKey } from "./catalogResolver";

const CATALOG_SEED_FALLBACK_IDS = new Set(["broken-promise-caasi-wills"]);

export function getSongDedupeKey(song: {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  artist_name?: unknown;
} | null | undefined): string {
  const id = String(song?.id || "").trim().toLowerCase();
  if (id) return `id:${id}`;

  const title = normalizeCatalogKey(song?.title);
  const artist = normalizeCatalogKey(song?.artist || song?.artist_name);
  return `meta:${title}:${artist}`;
}

export function isCatalogSeedFallback(song: { id?: unknown } | null | undefined): boolean {
  const id = String(song?.id || "").trim().toLowerCase();
  return CATALOG_SEED_FALLBACK_IDS.has(id);
}

type DedupeSongLike = {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  artist_name?: unknown;
};

export function dedupeSongList<T extends DedupeSongLike>(
  songs: T[],
  excludeKeys?: Set<string>
): { songs: T[]; keys: Set<string> } {
  const used = new Set(excludeKeys || []);
  const unique: T[] = [];

  songs.forEach((song) => {
    const key = getSongDedupeKey(song);
    if (!key || used.has(key)) return;
    used.add(key);
    unique.push(song);
  });

  return { songs: unique, keys: used };
}

export type DiscoverySectionSongs<T> = {
  id: string;
  songs: T[];
};

export type DedupeAdjacentSectionsOptions = {
  /** Allow seed fallback (e.g. Broken Promise) in at most this many sections. */
  maxSeedFallbackSections?: number;
};

/**
 * Removes duplicate songs across adjacent discovery sections (hero → rails → curated).
 * Does not pad sections with fallback songs when unique content is scarce.
 */
export function dedupeAdjacentDiscoverySections<T extends DedupeSongLike>(
  sections: DiscoverySectionSongs<T>[],
  options?: DedupeAdjacentSectionsOptions
): DiscoverySectionSongs<T>[] {
  const used = new Set<string>();
  let seedFallbackSections = 0;
  const maxSeedFallbackSections = options?.maxSeedFallbackSections ?? 1;

  return sections.map((section) => {
    const unique: T[] = [];

    section.songs.forEach((song) => {
      const key = getSongDedupeKey(song);
      if (!key || used.has(key)) return;

      if (isCatalogSeedFallback(song)) {
        if (seedFallbackSections >= maxSeedFallbackSections) return;
        seedFallbackSections += 1;
      }

      used.add(key);
      unique.push(song);
    });

    return {
      ...section,
      songs: unique,
    };
  });
}

export function logCatalogDedupeSummary(
  section: string,
  before: number,
  after: number
) {
  if (before === after) return;
  console.log("[catalog] dedupe summary", { before, after, section });
}
