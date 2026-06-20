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
import {
  logApiRefresh,
  logCacheResult,
  startPerformanceTimer,
} from "../utils/performanceLogs";
import { isAppActiveForWork } from "../utils/performanceMode";

const GENRE_PAGE_LIMIT = 36;
const GENRE_FALLBACK_SCAN_LIMIT = 60;
const HYDRATED_SNAPSHOT_SCAN_MAX = 150;

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
};

const viewCache = new Map<string, CatalogViewCacheEntry>();
const inflightLoads = new Map<string, Promise<CatalogViewResult>>();
const MAX_VIEW_CACHE_ENTRIES = 28;

function trimViewCache() {
  while (viewCache.size > MAX_VIEW_CACHE_ENTRIES) {
    const oldestKey = viewCache.keys().next().value;
    if (!oldestKey) break;
    viewCache.delete(oldestKey);
  }
}

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
  trimViewCache();

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

export function buildCatalogViewTarget(options: CatalogViewLoadOptions) {
  return buildCatalogTarget({
    type: options.type || "genre",
    id: options.id,
    title: options.title,
    query: options.query,
  });
}

export async function ensureCatalogViewPersistenceHydrated() {
  await hydratePersistedCatalogViewCache();
}

export function getInstantCatalogView(
  options: CatalogViewLoadOptions
): CatalogViewResult | null {
  const target = buildCatalogViewTarget(options);
  const cached = readUnifiedViewCache(target.cacheKey);

  if (cached?.entry.songs.length) {
    return buildResultFromCache(
      target,
      cached.entry,
      cached.freshness,
      cached.persistedHit
    );
  }

  const snapshot = getHiddenTunesCatalogSnapshot();
  if (!snapshot.length) return null;

  const matched = matchSongsForCatalogTarget(snapshot, target);
  if (!matched.length) return null;

  logCatalogViewDiagnostics("catalog_snapshot_hit", {
    viewKey: target.cacheKey,
    matchedCount: matched.length,
  });

  return {
    target,
    songs: matched,
    hasMore: true,
    page: 1,
    showedCached: true,
    cacheHit: true,
    persistedHit: false,
    viewFreshness: "catalog_snapshot",
    fallbackUsed: false,
    sourceSongCount: snapshot.length,
    matchedFromCache: matched.length,
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
  const inflightKey = `${target.cacheKey}:${page}:${options.forceRefresh ? "1" : "0"}`;

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
      const cached = readUnifiedViewCache(target.cacheKey);
      if (cached?.entry.songs.length) {
        return buildResultFromCache(
          target,
          cached.entry,
          cached.freshness,
          cached.persistedHit
        );
      }

      logCacheResult("catalog_view", false, {
        cacheKey: target.cacheKey,
        page,
      });
    }

    const hydrated = await hydrateHiddenTunesCatalogCache();
    const canScanHydratedSnapshot =
      hydrated.length > 0 && hydrated.length <= HYDRATED_SNAPSHOT_SCAN_MAX;
    const snapshotMatches =
      page === 1 && canScanHydratedSnapshot
        ? matchSongsForCatalogTarget(hydrated, target)
        : [];

    if (page === 1 && !options.forceRefresh && snapshotMatches.length) {
      const pageSongs = snapshotMatches.slice(0, limit);
      writeUnifiedViewCache(
        target,
        pageSongs,
        snapshotMatches.length > limit,
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
        hasMore: snapshotMatches.length > limit,
        page,
        showedCached: true,
        cacheHit: true,
        persistedHit: false,
        viewFreshness: "catalog_snapshot",
        fallbackUsed: false,
        sourceSongCount: hydrated.length,
        matchedFromCache: pageSongs.length,
        refreshResultCount: pageSongs.length,
        emptyStateReason: "content_available",
      };
    }

    if (page > 1 && target.type === "genre" && canScanHydratedSnapshot) {
      const allMatches = matchSongsForCatalogTarget(hydrated, target);
      const start = (page - 1) * limit;
      const pageSongs = allMatches.slice(start, start + limit);

      if (pageSongs.length) {
        return {
          target,
          songs: pageSongs,
          hasMore: start + limit < allMatches.length,
          page,
          showedCached: true,
          cacheHit: true,
          persistedHit: false,
          viewFreshness: "catalog_snapshot",
          fallbackUsed: false,
          sourceSongCount: hydrated.length,
          matchedFromCache: pageSongs.length,
          refreshResultCount: pageSongs.length,
          emptyStateReason: "content_available",
        };
      }
    }

    const cachedMatches =
      page === 1 && canScanHydratedSnapshot
        ? matchSongsForCatalogTarget(hydrated, target)
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
        genrePage.hasMore,
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
      hasMore: genrePage.hasMore,
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
