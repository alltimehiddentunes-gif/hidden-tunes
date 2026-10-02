import {
  buildCatalogTarget,
  getCatalogResolverDebugInfo,
  logCatalogResolverDebug,
  matchSongsForCatalogTarget,
  type CatalogResolverType,
  type CatalogTarget,
} from "../utils/catalogResolver";
import {
  clearPersistedCatalogViewCache,
  fromCompactCatalogSong,
  getCatalogViewFreshness,
  hydratePersistedCatalogViewCache,
  logCatalogViewDiagnostics,
  readPersistedCatalogView,
  toCompactCatalogSong,
  writePersistedCatalogView,
  type CatalogViewFreshness,
} from "./catalogViewPersistence";
import {
  getHiddenTunesCatalogSnapshot,
  getHiddenTunesSongsPage,
  hydrateHiddenTunesCatalogCache,
  type HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";
import { consumeCatalogViewSeed } from "./catalogViewSeed";
import {
  appendRoomDiscoveryTracks,
  getRoomDiscoverySession,
  peekRoomInitialTracks,
  resetRoomDiscoverySession,
  upsertRoomDiscoverySession,
} from "./roomDiscoverySession";
import { filterRelevantRoomTracks } from "./roomRelevance";
import {
  alignMoodRoomDiscoverySession,
  discoverMoodRoomPage,
  resetMoodRoomDiscoverySession,
  setMoodCatalogPageFetcher,
} from "./moodRoomDiscovery";
import {
  discoverGenreAnchoredMoodPage,
  resetGenreAnchoredSession,
  setGenreAnchoredPageFetcher,
  songMatchesGenreAnchor,
} from "./genreAnchoredMoodDiscovery";
import {
  logApiRefresh,
  logCacheResult,
  startPerformanceTimer,
} from "../utils/performanceLogs";
import { isAppActiveForWork } from "../utils/performanceMode";

setMoodCatalogPageFetcher(async ({ page, limit }) => {
  const result = await getHiddenTunesSongsPage({
    page,
    limit,
    allowCatalogPagination: true,
  });
  return {
    songs: result.songs,
    hasMore: Boolean(result.hasMore),
  };
});

setGenreAnchoredPageFetcher(async ({ page, limit, genre }) => {
  const genreFilter = String(genre || "").trim();
  const result = await getHiddenTunesSongsPage({
    page,
    limit,
    // HARD: levels 0–3 query Country/Jazz/etc. directly — not global catalog.
    ...(genreFilter ? { genre: genreFilter } : {}),
    allowCatalogPagination: true,
  });
  // If genre API returns nothing, fall back to global page but discovery still
  // hard-filters by songMatchesGenreAnchor — never paint off-genre.
  if (genreFilter && !result.songs.length && page === 1) {
    const fallback = await getHiddenTunesSongsPage({
      page: 1,
      limit,
      allowCatalogPagination: true,
    });
    return {
      songs: fallback.songs,
      hasMore: Boolean(fallback.hasMore),
    };
  }
  return {
    songs: result.songs,
    hasMore: Boolean(result.hasMore),
  };
});

const GENRE_PAGE_LIMIT = 36;
const GENRE_FALLBACK_SCAN_LIMIT = 60;
/** Soft bound for instant/open-path genre scans. */
const HYDRATED_SNAPSHOT_SCAN_MAX = 150;
const MOOD_SNAPSHOT_SCAN_MAX = 500;

type CatalogViewCacheEntry = {
  songs: HiddenTunesNormalizedSong[];
  hasMore: boolean;
  fallbackUsed: boolean;
  cachedAt: number;
  source: "memory" | "persisted" | "catalog_snapshot";
};

export type CatalogViewLoadOptions = {
  type?: CatalogResolverType;
  id?: string;
  title?: string;
  query?: string;
  /** Hard genre lock when mood was chosen inside a genre session. */
  genreAnchor?: string;
  page?: number;
  limit?: number;
  forceRefresh?: boolean;
};

export type CatalogViewResult = {
  target: CatalogTarget;
  songs: HiddenTunesNormalizedSong[];
  hasMore: boolean;
  page: number;
  showedCached: boolean;
  cacheHit: boolean;
  persistedHit: boolean;
  viewFreshness: CatalogViewFreshness | "catalog_snapshot" | "none";
  fallbackUsed: boolean;
  sourceSongCount: number;
  matchedFromCache: number;
  refreshResultCount: number;
  emptyStateReason:
    | "content_available"
    | "cache_api_and_resolver_empty"
    | "awaiting_load";
  /** Temporary physical diagnostic for genre-anchored mood rooms. */
  genreAnchor?: string;
  broadeningLevel?: number;
};

const viewCache = new Map<string, CatalogViewCacheEntry>();
const inflightLoads = new Map<string, Promise<CatalogViewResult>>();

function dedupeCatalogSongs(songs: HiddenTunesNormalizedSong[]) {
  const seen = new Set<string>();

  return songs.filter((song) => {
    const key = String(song.id || song.streamUrl || song.url).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return Boolean(song.streamUrl || song.url);
  });
}

function buildResultFromCache(
  target: CatalogTarget,
  entry: CatalogViewCacheEntry,
  freshness: CatalogViewFreshness | "catalog_snapshot",
  persistedHit: boolean
): CatalogViewResult {
  logCatalogViewDiagnostics(persistedHit ? "persisted_hit" : "memory_view_hit", {
    viewKey: target.cacheKey,
    matchedCount: entry.songs.length,
    freshness,
    source: entry.source,
  });

  return {
    target,
    songs: entry.songs,
    hasMore: entry.hasMore,
    page: 1,
    showedCached: true,
    cacheHit: true,
    persistedHit,
    viewFreshness: freshness,
    fallbackUsed: entry.fallbackUsed,
    sourceSongCount: entry.songs.length,
    matchedFromCache: entry.songs.length,
    refreshResultCount: 0,
    emptyStateReason: "content_available",
  };
}

function readUnifiedViewCache(cacheKey: string) {
  const memoryEntry = viewCache.get(cacheKey);
  if (memoryEntry?.songs.length) {
    const freshness = getCatalogViewFreshness(memoryEntry.cachedAt);
    if (freshness !== "expired") {
      return {
        entry: memoryEntry,
        freshness,
        persistedHit: memoryEntry.source === "persisted",
      };
    }

    viewCache.delete(cacheKey);
  }

  const persisted = readPersistedCatalogView(cacheKey);
  if (!persisted) {
    logCatalogViewDiagnostics("persisted_miss", { viewKey: cacheKey });
    return null;
  }

  const entry: CatalogViewCacheEntry = {
    songs: persisted.record.songs.map(fromCompactCatalogSong),
    hasMore: persisted.record.hasMore,
    fallbackUsed: persisted.record.fallbackUsed,
    cachedAt: persisted.record.cachedAt,
    source: "persisted",
  };

  viewCache.set(cacheKey, entry);

  return {
    entry,
    freshness: persisted.freshness,
    persistedHit: true,
  };
}

function writeUnifiedViewCache(
  target: CatalogTarget,
  songs: HiddenTunesNormalizedSong[],
  hasMore: boolean,
  fallbackUsed: boolean,
  source: CatalogViewCacheEntry["source"]
) {
  if (!songs.length) return;

  const cachedAt = Date.now();

  viewCache.set(target.cacheKey, {
    songs,
    hasMore,
    fallbackUsed,
    cachedAt,
    source,
  });

  void writePersistedCatalogView({
    cacheKey: target.cacheKey,
    targetType: target.type,
    targetId: target.id,
    targetTitle: target.title,
    targetQuery: target.query,
    songs: songs.map(toCompactCatalogSong),
    hasMore,
    fallbackUsed,
    cachedAt,
    source: source === "persisted" ? "persisted" : "api",
    matchedCount: songs.length,
  });
}

/** Drop stale/wrong room candidates before Explore → Room open. */
export function invalidateCatalogViewForTarget(options: CatalogViewLoadOptions) {
  const target = buildCatalogViewTarget(options);
  viewCache.delete(target.cacheKey);
  for (const key of Array.from(inflightLoads.keys())) {
    if (key.startsWith(`${target.cacheKey}:`)) inflightLoads.delete(key);
  }
  resetRoomDiscoverySession({
    type: target.type,
    id: target.id,
    title: target.title,
    query: target.query,
  });
  if (target.type === "mood") {
    resetMoodRoomDiscoverySession(target.title, target.id);
    const genreAnchor = String(options.genreAnchor || "").trim();
    if (genreAnchor) {
      resetGenreAnchoredSession({
        genre: genreAnchor,
        mood: target.title,
        id: target.id,
      });
    }
  }
  return target;
}

function relevantOrEmpty(
  songs: HiddenTunesNormalizedSong[],
  target: CatalogTarget,
  limit: number,
  genreAnchor?: string
) {
  return filterRelevantRoomTracks(songs, {
    type: target.type,
    id: target.id,
    title: target.title,
    query: target.query,
    limit,
    genreAnchor: genreAnchor || undefined,
  });
}

export function buildCatalogViewTarget(options: CatalogViewLoadOptions) {
  const genreAnchor = String(options.genreAnchor || "").trim();
  const base = buildCatalogTarget({
    type: options.type || "genre",
    id: options.id,
    title: options.title,
    query: options.query,
  });
  if (!genreAnchor || base.type !== "mood") return base;
  // Isolate Country|Reflective cache from global Reflective.
  return {
    ...base,
    id: String(options.id || `${genreAnchor}|${base.title}`).trim(),
    cacheKey: `mood:${normalizeCachePart(genreAnchor)}|${normalizeCachePart(base.title)}`,
    query: base.query,
  };
}

function normalizeCachePart(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

export async function ensureCatalogViewPersistenceHydrated() {
  await hydratePersistedCatalogViewCache();
}

export function getInstantCatalogView(
  options: CatalogViewLoadOptions
): CatalogViewResult | null {
  const target = buildCatalogViewTarget(options);
  const limit = Math.min(Math.max(Number(options.limit) || GENRE_PAGE_LIMIT, 1), 100);
  const genreAnchor = String(options.genreAnchor || "").trim();

  const seeded = consumeCatalogViewSeed({
    type: target.type,
    id: target.id,
    title: target.title,
    query: target.query,
    genreAnchor: genreAnchor || undefined,
  });
  if (seeded?.length) {
    const relevant = relevantOrEmpty(seeded, target, limit, genreAnchor);
    if (relevant.length) {
      writeUnifiedViewCache(
        target,
        relevant,
        seeded.length > relevant.length || relevant.length >= limit,
        false,
        "memory"
      );
      return {
        target,
        songs: relevant,
        hasMore: true,
        page: 1,
        showedCached: true,
        cacheHit: true,
        persistedHit: false,
        viewFreshness: "fresh",
        fallbackUsed: false,
        sourceSongCount: seeded.length,
        matchedFromCache: relevant.length,
        refreshResultCount: relevant.length,
        emptyStateReason: "content_available",
        genreAnchor: genreAnchor || undefined,
      };
    }
  }

  const sessionTracks = peekRoomInitialTracks({
    type: target.type,
    id: target.id,
    title: target.title,
    query: target.query,
  });
  if (sessionTracks.length) {
    const relevant = relevantOrEmpty(sessionTracks, target, limit, genreAnchor);
    if (relevant.length) {
      writeUnifiedViewCache(target, relevant, true, false, "memory");
      return {
        target,
        songs: relevant,
        hasMore: true,
        page: 1,
        showedCached: true,
        cacheHit: true,
        persistedHit: false,
        viewFreshness: "fresh",
        fallbackUsed: false,
        sourceSongCount: sessionTracks.length,
        matchedFromCache: relevant.length,
        refreshResultCount: relevant.length,
        emptyStateReason: "content_available",
      };
    }
    // Stale unrelated session (e.g. old African pad) — drop it.
    resetRoomDiscoverySession({
      type: target.type,
      id: target.id,
      title: target.title,
      query: target.query,
    });
  }

  const cached = readUnifiedViewCache(target.cacheKey);

  if (cached?.entry.songs.length) {
    const relevant = relevantOrEmpty(cached.entry.songs, target, limit, genreAnchor);
    if (!relevant.length) {
      viewCache.delete(target.cacheKey);
    } else {
      if (target.type === "mood") {
        alignMoodRoomDiscoverySession(
          target.title,
          target.id,
          relevant,
          cached.entry.hasMore
        );
      }
      const result = buildResultFromCache(
        target,
        { ...cached.entry, songs: relevant },
        cached.freshness,
        cached.persistedHit
      );
      return {
        ...result,
        songs: relevant,
        hasMore: cached.entry.hasMore || cached.entry.songs.length > relevant.length,
        genreAnchor: genreAnchor || undefined,
      };
    }
  }

  const snapshot = getHiddenTunesCatalogSnapshot();
  if (!snapshot.length) return null;

  const scanCap =
    target.type === "mood" ? MOOD_SNAPSHOT_SCAN_MAX : HYDRATED_SNAPSHOT_SCAN_MAX;
  const scanSource =
    snapshot.length > scanCap ? snapshot.slice(0, scanCap) : snapshot;
  const matched = matchSongsForCatalogTarget(scanSource, target);
  const relevant = relevantOrEmpty(matched, target, limit, genreAnchor);
  if (!relevant.length) return null;

  logCatalogViewDiagnostics("catalog_snapshot_hit", {
    viewKey: target.cacheKey,
    matchedCount: relevant.length,
  });

  return {
    target,
    songs: relevant,
    hasMore:
      matched.length > relevant.length || snapshot.length > scanSource.length,
    page: 1,
    showedCached: true,
    cacheHit: true,
    persistedHit: false,
    viewFreshness: "catalog_snapshot",
    fallbackUsed: false,
    sourceSongCount: scanSource.length,
    matchedFromCache: relevant.length,
    refreshResultCount: 0,
    emptyStateReason: "content_available",
  };
}

export function prefetchCatalogView(options: CatalogViewLoadOptions) {
  if (!isAppActiveForWork()) return;

  void loadCatalogView({
    ...options,
    page: 1,
    forceRefresh: false,
  }).catch(() => {});
}

export async function loadCatalogView(
  options: CatalogViewLoadOptions
): Promise<CatalogViewResult> {
  await ensureCatalogViewPersistenceHydrated();

  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || GENRE_PAGE_LIMIT, 1), 100);
  const target = buildCatalogViewTarget(options);
  const genreAnchorKey = String(options.genreAnchor || "").trim().toLowerCase();
  const inflightKey = `${target.cacheKey}:${page}:${options.forceRefresh ? "1" : "0"}:${genreAnchorKey}`;

  if (!options.forceRefresh) {
    const inflight = inflightLoads.get(inflightKey);
    if (inflight) return inflight;
  }

  const task = (async (): Promise<CatalogViewResult> => {
    const refreshStart = startPerformanceTimer();
    let showedCached = false;
    let matchedFromCache = 0;
    let fallbackUsed = false;
    let sourceSongCount = 0;
    let persistedHit = false;
    let viewFreshness: CatalogViewResult["viewFreshness"] = "none";

    if (page === 1 && !options.forceRefresh) {
      // Shared room session — only if tracks are still relevant to THIS room.
      const sessionTracks = peekRoomInitialTracks({
        type: target.type,
        id: target.id,
        title: target.title,
        query: target.query,
      });
      if (sessionTracks.length) {
        const relevant = relevantOrEmpty(sessionTracks, target, limit, genreAnchorKey || undefined);
        if (relevant.length) {
          const session = getRoomDiscoverySession({
            type: target.type,
            id: target.id,
            title: target.title,
            query: target.query,
          });
          if (target.type === "mood") {
            alignMoodRoomDiscoverySession(
              target.title,
              target.id,
              relevant,
              session?.hasMore !== false
            );
          }
          writeUnifiedViewCache(
            target,
            relevant,
            session?.hasMore !== false,
            false,
            "memory"
          );
          return {
            target,
            songs: relevant,
            hasMore: session?.hasMore !== false,
            page: 1,
            showedCached: true,
            cacheHit: true,
            persistedHit: false,
            viewFreshness: "fresh",
            fallbackUsed: false,
            sourceSongCount: sessionTracks.length,
            matchedFromCache: relevant.length,
            refreshResultCount: relevant.length,
            emptyStateReason: "content_available",
            genreAnchor: genreAnchorKey || undefined,
          };
        }
        resetRoomDiscoverySession({
          type: target.type,
          id: target.id,
          title: target.title,
          query: target.query,
        });
        viewCache.delete(target.cacheKey);
      }

      const cached = readUnifiedViewCache(target.cacheKey);
      if (cached?.entry.songs.length) {
        const relevant = relevantOrEmpty(
          cached.entry.songs,
          target,
          limit,
          genreAnchorKey || undefined
        );
        if (relevant.length) {
          if (target.type === "mood") {
            alignMoodRoomDiscoverySession(
              target.title,
              target.id,
              relevant,
              cached.entry.hasMore
            );
          }
          return {
            ...buildResultFromCache(
              target,
              { ...cached.entry, songs: relevant },
              cached.freshness,
              cached.persistedHit
            ),
            genreAnchor: genreAnchorKey || undefined,
          };
        }
        viewCache.delete(target.cacheKey);
      }

      logCacheResult("catalog_view", false, {
        cacheKey: target.cacheKey,
        page,
      });
    }

    // Mood Rooms: paginated discovery over eligible catalog (bounded windows).
    // Never fetchAll / retain full catalog in memory.
    if (target.type === "mood") {
      const genreAnchor = String(options.genreAnchor || "").trim();

      // Genre-anchored mood: Country + Reflective stays inside Country until exhausted.
      if (genreAnchor) {
        if (page === 1 && options.forceRefresh) {
          resetGenreAnchoredSession({
            genre: genreAnchor,
            mood: target.title,
            id: target.id,
          });
        }

        const anchored = await discoverGenreAnchoredMoodPage({
          genre: genreAnchor,
          mood: target.title,
          id: target.id,
          limit,
          reset: page === 1 && Boolean(options.forceRefresh),
        });

        const resultGenres = Array.from(
          new Set(
            anchored.songs
              .map((song) => String(song.genre || "").trim())
              .filter(Boolean)
          )
        );

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[HTGenreAnchoredMood]", {
            genreAnchor,
            mood: target.title,
            page,
            count: anchored.songs.length,
            level: anchored.broadeningLevel,
            hasMore: anchored.hasMore,
            windowsScanned: anchored.windowsScanned,
            RESULT_GENRES: resultGenres,
          });
        }

        // Absolute safety: never return off-genre at levels 0–3.
        const safeSongs =
          anchored.broadeningLevel <= 3
            ? anchored.songs.filter((song) =>
                songMatchesGenreAnchor(song, genreAnchor)
              )
            : anchored.songs;

        if (page === 1 && safeSongs.length) {
          upsertRoomDiscoverySession({
            type: target.type,
            id: target.id,
            title: target.title,
            query: target.query,
            initialTracks: safeSongs as any,
            hasMore: anchored.hasMore,
            replaceTracks: true,
          });
          writeUnifiedViewCache(
            target,
            safeSongs as any,
            anchored.hasMore,
            anchored.broadeningLevel > 0,
            "memory"
          );
        } else if (page > 1 && safeSongs.length) {
          appendRoomDiscoveryTracks(
            {
              type: target.type,
              id: target.id,
              title: target.title,
              query: target.query,
            },
            safeSongs as any,
            {
              hasMore: anchored.hasMore,
              discoveryLevel: anchored.broadeningLevel,
              continuationCursor: anchored.cursor.catalogPage,
            }
          );
        }

        logApiRefresh("catalog_view", refreshStart, {
          cacheKey: target.cacheKey,
          page,
          count: safeSongs.length,
          fallbackUsed: anchored.broadeningLevel >= 4,
          persistedHit: false,
          freshness: "fresh",
          source: "genre_anchored_mood_discovery",
        });

        return {
          target,
          songs: safeSongs as any,
          hasMore: anchored.hasMore,
          page,
          showedCached: false,
          cacheHit: false,
          persistedHit: false,
          viewFreshness: "fresh",
          fallbackUsed: anchored.broadeningLevel >= 4,
          sourceSongCount: anchored.sourceSongCount,
          matchedFromCache: 0,
          refreshResultCount: safeSongs.length,
          emptyStateReason: safeSongs.length
            ? "content_available"
            : "cache_api_and_resolver_empty",
          genreAnchor,
          broadeningLevel: anchored.broadeningLevel,
        };
      }

      const existingSession = getRoomDiscoverySession({
        type: target.type,
        id: target.id,
        title: target.title,
        query: target.query,
      });

      // Page 1 with Explore/session tracks: return only still-relevant rows.
      if (page === 1 && !options.forceRefresh && existingSession?.tracks.length) {
        const relevant = relevantOrEmpty(
          existingSession.tracks,
          target,
          limit,
          genreAnchor || undefined
        );
        if (relevant.length) {
          alignMoodRoomDiscoverySession(
            target.title,
            target.id,
            relevant,
            existingSession.hasMore
          );
          writeUnifiedViewCache(
            target,
            relevant,
            existingSession.hasMore,
            false,
            "memory"
          );
          return {
            target,
            songs: relevant,
            hasMore: existingSession.hasMore,
            page: 1,
            showedCached: true,
            cacheHit: true,
            persistedHit: false,
            viewFreshness: "fresh",
            fallbackUsed: false,
            sourceSongCount: existingSession.tracks.length,
            matchedFromCache: relevant.length,
            refreshResultCount: relevant.length,
            emptyStateReason: "content_available",
          };
        }
        resetRoomDiscoverySession({
          type: target.type,
          id: target.id,
          title: target.title,
          query: target.query,
        });
      }

      if (page === 1) {
        resetMoodRoomDiscoverySession(target.title, target.id);
      } else {
        const liveSession = getRoomDiscoverySession({
          type: target.type,
          id: target.id,
          title: target.title,
          query: target.query,
        });
        if (liveSession?.tracks.length) {
          const relevantLive = relevantOrEmpty(
            liveSession.tracks,
            target,
            limit,
            genreAnchor || undefined
          );
          if (relevantLive.length) {
            alignMoodRoomDiscoverySession(
              target.title,
              target.id,
              relevantLive,
              liveSession.hasMore
            );
          }
        }
      }

      const moodPage = await discoverMoodRoomPage({
        moodLabel: target.title,
        id: target.id,
        limit,
        reset: page === 1,
      });

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[HTMoodRoomDiscovery]", {
          title: target.title,
          page,
          normalizedConcepts: moodPage.concepts,
          candidatesAfterMatch: moodPage.songs.length,
          hasMore: moodPage.hasMore,
          broadenLevel: moodPage.broadenLevel,
          windowsScanned: moodPage.windowsScanned,
          sourceSongCount: moodPage.sourceSongCount,
          discoveryCalled: true,
        });
      }

      if (page === 1 && moodPage.songs.length) {
        upsertRoomDiscoverySession({
          type: target.type,
          id: target.id,
          title: target.title,
          query: target.query,
          initialTracks: moodPage.songs,
          hasMore: moodPage.hasMore,
          replaceTracks: Boolean(options.forceRefresh),
        });
        writeUnifiedViewCache(
          target,
          moodPage.songs,
          moodPage.hasMore,
          moodPage.broadenLevel > 0,
          "memory"
        );
      } else if (page > 1 && moodPage.songs.length) {
        appendRoomDiscoveryTracks(
          {
            type: target.type,
            id: target.id,
            title: target.title,
            query: target.query,
          },
          moodPage.songs,
          {
            hasMore: moodPage.hasMore,
            discoveryLevel: moodPage.broadenLevel,
            continuationCursor: moodPage.cursor.catalogPage,
          }
        );
      }

      // Never re-serve stale unrelated handoff tracks.
      if (page === 1 && !moodPage.songs.length) {
        const relevantFallback = existingSession?.tracks.length
          ? relevantOrEmpty(
              existingSession.tracks,
              target,
              limit,
              genreAnchor || undefined
            )
          : [];
        if (relevantFallback.length) {
          return {
            target,
            songs: relevantFallback,
            hasMore: true,
            page: 1,
            showedCached: true,
            cacheHit: true,
            persistedHit: false,
            viewFreshness: "fresh",
            fallbackUsed: false,
            sourceSongCount: existingSession?.tracks.length || 0,
            matchedFromCache: relevantFallback.length,
            refreshResultCount: 0,
            emptyStateReason: "content_available",
          };
        }
      }

      logApiRefresh("catalog_view", refreshStart, {
        cacheKey: target.cacheKey,
        page,
        count: moodPage.songs.length,
        fallbackUsed: moodPage.broadenLevel > 0,
        persistedHit: false,
        freshness: "fresh",
        source: "mood_paginated_discovery",
      });

      return {
        target,
        songs: moodPage.songs,
        hasMore: moodPage.hasMore,
        page,
        showedCached: false,
        cacheHit: false,
        persistedHit: false,
        viewFreshness: "fresh",
        fallbackUsed: moodPage.broadenLevel > 0,
        sourceSongCount: moodPage.sourceSongCount,
        matchedFromCache: 0,
        refreshResultCount: moodPage.songs.length,
        emptyStateReason: moodPage.songs.length
          ? "content_available"
          : "cache_api_and_resolver_empty",
      };
    }

    const hydrated = await hydrateHiddenTunesCatalogCache();
    const scanCap = HYDRATED_SNAPSHOT_SCAN_MAX;
    const scanSource =
      hydrated.length > scanCap ? hydrated.slice(0, scanCap) : hydrated;
    const canScanHydratedSnapshot = scanSource.length > 0;
    const snapshotMatches =
      page === 1 && canScanHydratedSnapshot
        ? matchSongsForCatalogTarget(scanSource, target)
        : [];

    if (page === 1 && !options.forceRefresh && snapshotMatches.length) {
      const pageSongs = snapshotMatches.slice(0, limit);
      writeUnifiedViewCache(
        target,
        pageSongs,
        snapshotMatches.length > limit || hydrated.length > scanSource.length,
        false,
        "catalog_snapshot"
      );

      logApiRefresh("catalog_view", refreshStart, {
        cacheKey: target.cacheKey,
        page,
        count: pageSongs.length,
        fallbackUsed: false,
        persistedHit: false,
        freshness: "catalog_snapshot",
        source: "catalog_snapshot",
      });

      return {
        target,
        songs: pageSongs,
        hasMore:
          snapshotMatches.length > limit || hydrated.length > scanSource.length,
        page,
        showedCached: true,
        cacheHit: true,
        persistedHit: false,
        viewFreshness: "catalog_snapshot",
        fallbackUsed: false,
        sourceSongCount: scanSource.length,
        matchedFromCache: pageSongs.length,
        refreshResultCount: pageSongs.length,
        emptyStateReason: "content_available",
      };
    }

    if (page > 1 && canScanHydratedSnapshot) {
      const allMatches = matchSongsForCatalogTarget(scanSource, target);
      const start = (page - 1) * limit;
      const pageSongs = allMatches.slice(start, start + limit);

      if (pageSongs.length) {
        return {
          target,
          songs: pageSongs,
          hasMore: start + limit < allMatches.length || hydrated.length > scanSource.length,
          page,
          showedCached: true,
          cacheHit: true,
          persistedHit: false,
          viewFreshness: "catalog_snapshot",
          fallbackUsed: false,
          sourceSongCount: scanSource.length,
          matchedFromCache: pageSongs.length,
          refreshResultCount: pageSongs.length,
          emptyStateReason: "content_available",
        };
      }
    }

    const cachedMatches =
      page === 1 && canScanHydratedSnapshot
        ? matchSongsForCatalogTarget(scanSource, target)
        : [];

    if (!showedCached && cachedMatches.length) {
      showedCached = true;
      matchedFromCache = cachedMatches.length;
      viewFreshness = "fresh";
      logCacheResult("catalog_view", true, {
        cacheKey: target.cacheKey,
        count: cachedMatches.length,
        source: "catalog_hydrate",
      });
    }

    const genrePage = await getHiddenTunesSongsPage({
      page,
      limit,
      genre: target.title,
    });

    sourceSongCount = genrePage.songs.length;
    let apiMatches = matchSongsForCatalogTarget(genrePage.songs, target);
    let scopedPage = genrePage;

    if (page === 1 && !apiMatches.length && !cachedMatches.length) {
      const fallbackPage = await getHiddenTunesSongsPage({
        page: 1,
        limit: GENRE_FALLBACK_SCAN_LIMIT,
      });

      apiMatches = matchSongsForCatalogTarget(fallbackPage.songs, target);
      fallbackUsed = apiMatches.length > 0;
      sourceSongCount += fallbackPage.songs.length;
    }

    const songs =
      page === 1
        ? dedupeCatalogSongs(
            apiMatches.length || cachedMatches.length
              ? [...cachedMatches, ...apiMatches]
              : cachedMatches
          )
        : dedupeCatalogSongs(apiMatches);

    const resolvedSongs = songs.length ? songs : cachedMatches;

    if (page === 1) {
      writeUnifiedViewCache(
        target,
        resolvedSongs,
        scopedPage.hasMore,
        fallbackUsed,
        showedCached && persistedHit ? "persisted" : "memory"
      );
    }

    logApiRefresh("catalog_view", refreshStart, {
      cacheKey: target.cacheKey,
      page,
      count: resolvedSongs.length,
      fallbackUsed,
      persistedHit,
      freshness: viewFreshness,
    });

    logCatalogViewDiagnostics("refresh_complete", {
      viewKey: target.cacheKey,
      matchedCount: resolvedSongs.length,
      refreshResultCount: resolvedSongs.length,
      freshness: getCatalogViewFreshness(Date.now()),
      fallbackUsed,
    });

    logCatalogResolverDebug(
      "catalog-view-load",
      getCatalogResolverDebugInfo({
        label: target.title,
        type: target.type,
        songs: [...hydrated, ...genrePage.songs],
        matchedSongs: resolvedSongs,
        fallbackUsed,
      })
    );

    return {
      target,
      songs: resolvedSongs,
      hasMore: scopedPage.hasMore,
      page,
      showedCached,
      cacheHit: showedCached,
      persistedHit,
      viewFreshness:
        viewFreshness === "none"
          ? resolvedSongs.length
            ? "fresh"
            : "none"
          : viewFreshness,
      fallbackUsed,
      sourceSongCount,
      matchedFromCache,
      refreshResultCount: resolvedSongs.length,
      emptyStateReason: resolvedSongs.length
        ? "content_available"
        : "cache_api_and_resolver_empty",
    };
  })();

  inflightLoads.set(inflightKey, task);

  try {
    return await task;
  } finally {
    inflightLoads.delete(inflightKey);
  }
}

export async function clearUnifiedCatalogViewCache() {
  viewCache.clear();
  inflightLoads.clear();
  await clearPersistedCatalogViewCache();
}
