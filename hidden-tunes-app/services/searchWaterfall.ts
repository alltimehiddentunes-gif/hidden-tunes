import { searchArchiveAudio } from "./archiveSearch";
import {
  getHiddenTunesCatalogSnapshot,
  searchHiddenTunesSongsPage,
} from "./hiddenTunesApi";
import {
  normalizeArchiveTrack,
  normalizeAudiusTrack,
} from "./musicNormalizer";
import {
  mergeCatalogSongLists,
  rankCatalogSongs,
} from "../utils/catalogSongRanking";

export const HIDDEN_TUNES_SEARCH_LABEL = "Hidden Tunes";
export const WATERFALL_MIN_SONGS = 2;
export const LOCAL_CATALOG_MERGE_LIMIT = 160;

function normalizeDedupeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getTrackArtistLabel(track: Record<string, unknown>) {
  const user = track.user as { name?: string } | undefined;
  return String(track.artist || user?.name || "").trim();
}

function providerPriority(source: unknown) {
  const value = String(source || "");
  if (value === "hidden-tunes" || value === "r2") return 0;
  if (value === "audius") return 1;
  if (value === "archive") return 2;
  return 3;
}

export function dedupeWaterfallTracks(
  tracks: Record<string, unknown>[]
): Record<string, unknown>[] {
  const bestByKey = new Map<string, Record<string, unknown>>();

  for (const track of tracks) {
    const idKey = String(track.id || track.streamUrl || track.url || "").trim();
    const titleArtistKey = `${normalizeDedupeText(String(track.title || ""))}|${normalizeDedupeText(getTrackArtistLabel(track))}`;
    const key = idKey || titleArtistKey;

    if (!key || key === "|") continue;

    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, track);
      continue;
    }

    if (providerPriority(track.source) < providerPriority(existing.source)) {
      bestByKey.set(key, track);
    }
  }

  return Array.from(bestByKey.values());
}

export type WaterfallSearchSource = "all" | "hidden" | "audius" | "archive";

function brandTrack(item: Record<string, unknown>, internalSource: string) {
  return {
    ...item,
    source: internalSource,
    sourceName: HIDDEN_TUNES_SEARCH_LABEL,
  };
}

function countPlayableTracks(items: Record<string, unknown>[]) {
  return items.filter((track) => {
    const audio = String(
      track.streamUrl || track.url || track.audioUrl || track.audio_url || ""
    ).trim();

    return audio.length > 0;
  }).length;
}

export async function fetchAudiusSearchTracks(
  query: string,
  limit = 20
): Promise<Record<string, unknown>[]> {
  const safeText = String(query || "").trim();
  if (!safeText) return [];

  try {
    const response = await fetch(
      `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(
        safeText
      )}&limit=${Math.min(Math.max(limit, 1), 30)}`
    );

    if (!response.ok) return [];

    const rawText = await response.text();
    if (!rawText.trim().startsWith("{")) return [];

    const json = JSON.parse(rawText);

    return (json.data || []).map((item: Record<string, unknown>) => {
      const id = String(item.id || "");
      const streamUrl = id
        ? `https://discoveryprovider.audius.co/v1/tracks/${id}/stream`
        : "";
      const artwork = item.artwork as Record<string, string> | undefined;

      return brandTrack(
        {
          ...normalizeAudiusTrack({
            ...item,
            streamUrl,
            source: "audius",
          }),
          type: "audius",
          cover:
            artwork?.["150x150"] ||
            artwork?.["480x480"] ||
            artwork?.["1000x1000"] ||
            "",
          streamUrl,
          url: streamUrl,
        },
        "audius"
      );
    });
  } catch {
    return [];
  }
}

export async function fetchArchiveSearchTracks(
  query: string
): Promise<Record<string, unknown>[]> {
  const safeText = String(query || "").trim();
  if (!safeText) return [];

  try {
    const archiveResults = await searchArchiveAudio(safeText);

    return archiveResults.map((item) =>
      brandTrack(
        {
          ...normalizeArchiveTrack({
            ...item,
            source: "archive",
          }),
          type: "archive",
          cover: item.cover || "",
        },
        "archive"
      )
    );
  } catch {
    return [];
  }
}

export async function fetchHiddenTunesBackendTracks(query: string) {
  const safeText = String(query || "").trim();
  if (!safeText) {
    return { tracks: [] as Record<string, unknown>[], hasMore: false };
  }

  const hiddenTunesPage = await searchHiddenTunesSongsPage(safeText, 1, 60);
  const mergedHiddenCatalog = mergeCatalogSongLists(
    hiddenTunesPage.songs,
    getHiddenTunesCatalogSnapshot().slice(0, LOCAL_CATALOG_MERGE_LIMIT)
  );
  const rankedHidden = rankCatalogSongs(mergedHiddenCatalog, safeText, 60);

  return {
    tracks: rankedHidden.map((hit) =>
      brandTrack(
        {
          ...hit.song,
          type: "r2",
          matchReason: hit.matchReason,
        },
        "hidden-tunes"
      )
    ),
    hasMore: hiddenTunesPage.hasMore,
    remoteSongs: hiddenTunesPage.songs || [],
  };
}

export async function runSearchWaterfall(
  query: string,
  source: WaterfallSearchSource
): Promise<{
  tracks: Record<string, unknown>[];
  hasMoreHidden: boolean;
  remoteCatalogSongs: ReturnType<typeof getHiddenTunesCatalogSnapshot>;
}> {
  const safeText = String(query || "").trim();
  const finalResults: Record<string, unknown>[] = [];
  let hasMoreHidden = false;
  let remoteCatalogSongs: ReturnType<typeof getHiddenTunesCatalogSnapshot> = [];

  if (source === "all" || source === "hidden") {
    const hidden = await fetchHiddenTunesBackendTracks(safeText);
    finalResults.push(...hidden.tracks);
    hasMoreHidden = hidden.hasMore;
    remoteCatalogSongs = hidden.remoteSongs ?? [];
  }

  if (source === "audius") {
    finalResults.push(...(await fetchAudiusSearchTracks(safeText, 30)));
    return {
      tracks: dedupeWaterfallTracks(finalResults),
      hasMoreHidden: false,
      remoteCatalogSongs,
    };
  }

  if (source === "archive") {
    finalResults.push(...(await fetchArchiveSearchTracks(safeText)));
    return {
      tracks: dedupeWaterfallTracks(finalResults),
      hasMoreHidden: false,
      remoteCatalogSongs,
    };
  }

  if (countPlayableTracks(finalResults) < WATERFALL_MIN_SONGS) {
    finalResults.push(...(await fetchAudiusSearchTracks(safeText, 20)));
  }

  if (countPlayableTracks(finalResults) < WATERFALL_MIN_SONGS) {
    finalResults.push(...(await fetchArchiveSearchTracks(safeText)));
  }

  return {
    tracks: dedupeWaterfallTracks(finalResults),
    hasMoreHidden,
    remoteCatalogSongs,
  };
}

export function countLocalInstantSongs(
  catalogSongs: Parameters<typeof rankCatalogSongs>[0],
  query: string
) {
  const safeText = String(query || "").trim();
  if (!safeText) return 0;

  return rankCatalogSongs(catalogSongs, safeText, WATERFALL_MIN_SONGS + 4).length;
}
