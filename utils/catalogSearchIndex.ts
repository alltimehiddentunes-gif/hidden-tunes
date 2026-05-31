import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import { getHydratedCatalogTrackOnce } from "../state/catalogHydrationCache";
import {
  rankCatalogSongs,
  scoreCatalogSongMatch,
  type CatalogSongMatchReason,
} from "./catalogSongRanking";
import { normalizeSearchText } from "./universalSearch";

export type { CatalogSongMatchReason };
export { scoreCatalogSongMatch, rankCatalogSongs };

export type CatalogSearchIndexEntry = {
  songId: string;
  haystack: string;
  titleKey: string;
  artistKey: string;
  genreKey: string;
  song: HiddenTunesNormalizedSong;
};

export type CatalogSearchIndex = {
  entries: CatalogSearchIndexEntry[];
  builtAt: number;
  songCount: number;
};

function buildSongHaystack(song: HiddenTunesNormalizedSong): string {
  const raw = song.raw || {};

  return normalizeSearchText(
    [
      song.title,
      song.artist,
      song.album,
      song.genre,
      song.mood,
      raw.tags,
      raw.description,
      song.sourceName,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function buildCatalogSearchIndex(
  songs: HiddenTunesNormalizedSong[]
): CatalogSearchIndex {
  const entries: CatalogSearchIndexEntry[] = [];

  for (const song of songs) {
    const songId = String(song.id || "").trim();
    if (!songId) continue;

    const hydratedSong = getHydratedCatalogTrackOnce(
      song
    ) as HiddenTunesNormalizedSong;

    entries.push({
      songId,
      haystack: buildSongHaystack(hydratedSong),
      titleKey: normalizeSearchText(hydratedSong.title),
      artistKey: normalizeSearchText(hydratedSong.artist),
      genreKey: normalizeSearchText(hydratedSong.genre || hydratedSong.mood),
      song: hydratedSong,
    });
  }

  return {
    entries,
    builtAt: Date.now(),
    songCount: entries.length,
  };
}

export function searchCatalogIndex(
  index: CatalogSearchIndex,
  query: string,
  limit = 24
): HiddenTunesNormalizedSong[] {
  const songs = index.entries.map((entry) => entry.song);
  return rankCatalogSongs(songs, query, limit).map((hit) => hit.song);
}
