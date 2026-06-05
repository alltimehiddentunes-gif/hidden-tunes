import type { HiddenTunesSong } from "../services/hiddenTunes";
import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import type { UniversalSearchGroupedResults } from "../services/universalSearchService";

export type SearchStationResult = {
  id: string;
  title: string;
  subtitle: string;
  tracks: HiddenTunesSong[];
  kind: "genre" | "room" | "station";
};

function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textMatchesQuery(value: unknown, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;
  const text = normalizeSearchText(value);
  return normalizedQuery.split(" ").every((part) => text.includes(part));
}

function catalogSongSearchText(song: HiddenTunesSong) {
  return [song.title, song.artist, song.album, song.genre, song.mood, song.lyrics]
    .filter(Boolean)
    .join(" ");
}

function dedupeSongs<T extends { id?: string; title?: string; artist?: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item, index) => {
    const key = String(item.id || `${item.artist || "artist"}-${item.title || "track"}-${index}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasInternalGroupedResults(results: UniversalSearchGroupedResults) {
  return (
    results.songs.length > 0 ||
    results.lyrics.length > 0 ||
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.genreMoods.length > 0 ||
    results.moodRooms.length > 0 ||
    results.playlists.length > 0
  );
}

export function songsFromSearchHits(
  results: UniversalSearchGroupedResults
): HiddenTunesSong[] {
  const seen = new Set<string>();
  const collected: HiddenTunesSong[] = [];

  for (const hit of [
    ...results.songs,
    ...results.lyrics,
    ...results.topResults,
  ]) {
    if (!hit?.id) continue;
    if (!String(hit.id).startsWith("song:") && !String(hit.id).startsWith("lyric:")) {
      continue;
    }
    const song = hit.payload as HiddenTunesSong;
    const id = String(song?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    collected.push(song);
  }

  return collected;
}

export function buildRelatedInternalDiscovery(
  query: string,
  catalogSongs: HiddenTunesSong[],
  anchorSongs: HiddenTunesSong[],
  limit = 24
) {
  const seeds = anchorSongs.slice(0, 4);
  if (!seeds.length || !catalogSongs.length) return [] as HiddenTunesSong[];

  const artists = new Set(
    seeds.map((song) => normalizeSearchText(song.artist)).filter(Boolean)
  );
  const albums = new Set(
    seeds.map((song) => normalizeSearchText(song.album)).filter(Boolean)
  );
  const genres = new Set(
    seeds.map((song) => normalizeSearchText(song.genre)).filter(Boolean)
  );
  const moods = new Set(
    seeds.map((song) => normalizeSearchText(song.mood)).filter(Boolean)
  );

  const seen = new Set(seeds.map((song) => String(song.id || "")));
  const related: HiddenTunesSong[] = [];

  for (const song of catalogSongs) {
    const id = String(song.id || "");
    if (!id || seen.has(id)) continue;

    const artist = normalizeSearchText(song.artist);
    const album = normalizeSearchText(song.album);
    const genre = normalizeSearchText(song.genre);
    const mood = normalizeSearchText(song.mood);

    const matches =
      (artist && artists.has(artist)) ||
      (album && albums.has(album)) ||
      (genre && genres.has(genre)) ||
      (mood && moods.has(mood)) ||
      textMatchesQuery(catalogSongSearchText(song), query);

    if (!matches) continue;

    related.push(song);
    seen.add(id);
    if (related.length >= limit) break;
  }

  return related;
}

export function buildSearchStations(
  query: string,
  catalogGenres: Array<{ id: string; title: string; songs: HiddenTunesSong[] }>,
  moodRooms: Array<{ id: string; title: string }>
): SearchStationResult[] {
  const stations: SearchStationResult[] = [];
  const seen = new Set<string>();

  for (const genre of catalogGenres) {
    const title = String(genre.title || "").trim();
    if (!title || !textMatchesQuery(title, query)) continue;
    const key = `genre:${genre.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stations.push({
      id: genre.id,
      title,
      subtitle: `${genre.songs.length} tracks`,
      tracks: genre.songs,
      kind: /station|radio/i.test(title) ? "station" : "genre",
    });
  }

  for (const room of moodRooms) {
    const title = String(room.title || "").trim();
    if (!title) continue;
    const key = `room:${room.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const catalogMatch = catalogGenres.find((genre) =>
      textMatchesQuery(genre.title, title)
    );

    stations.push({
      id: room.id,
      title,
      subtitle: catalogMatch ? `${catalogMatch.songs.length} tracks` : "Mood room",
      tracks: catalogMatch?.songs || [],
      kind: "room",
    });
  }

  return stations.slice(0, 12);
}

export function toNormalizedSongList(songs: HiddenTunesSong[]) {
  return songs as unknown as HiddenTunesNormalizedSong[];
}

import type {
  HiddenTunesAlbumCatalogItem,
  HiddenTunesArtistCatalogItem,
  HiddenTunesGenreCatalogItem,
} from "../services/hiddenTunes";
import {
  countDirectSearchMatches,
  countFallbackDemoted,
  rankSearchItems,
  rankSearchSongs,
  unwrapRankedSearchItems,
  type RankedSearchItem,
} from "./searchRanking";

export function rankApkSongResults(
  songs: HiddenTunesSong[],
  query: string,
  relatedSongs: HiddenTunesSong[] = []
) {
  const direct = rankSearchSongs(songs, query, { limit: 48 });
  const directIds = new Set(direct.map((entry) => String(entry.item.id || "")));

  const related = rankSearchSongs(
    relatedSongs.filter((song) => !directIds.has(String(song.id || ""))),
    query,
    { limit: 28, isRelatedFallback: true }
  );

  return [...direct, ...related].slice(0, 36);
}

export function rankApkAlbumResults(
  albums: HiddenTunesAlbumCatalogItem[],
  query: string,
  limit = 12
) {
  return unwrapRankedSearchItems(
    rankSearchItems(albums, query, {
      limit,
      getScoreItem: (album) => ({
        title: album.title,
        artist: album.artist,
        album: album.title,
      }),
    })
  );
}

export function rankApkArtistResults(
  artists: HiddenTunesArtistCatalogItem[],
  query: string,
  limit = 12
) {
  return unwrapRankedSearchItems(
    rankSearchItems(artists, query, {
      limit,
      getScoreItem: (artist) => ({
        artist: artist.name,
        name: artist.name,
        title: artist.name,
      }),
    })
  );
}

export function rankApkGenreResults(
  genres: HiddenTunesGenreCatalogItem[],
  query: string,
  limit = 12
) {
  return unwrapRankedSearchItems(
    rankSearchItems(genres, query, {
      limit,
      getScoreItem: (genre) => ({
        title: genre.title,
        genre: genre.title,
      }),
    })
  );
}

export function rankApkStationResults(stations: SearchStationResult[], query: string) {
  return unwrapRankedSearchItems(
    rankSearchItems(stations, query, {
      limit: 12,
      getScoreItem: (station) => ({
        title: station.title,
        genre: station.title,
        mood: station.kind === "room" ? station.title : undefined,
      }),
    })
  );
}

export function getApkSearchRankingDiagnostics<T extends { artist?: unknown; title?: unknown; name?: unknown }>(
  query: string,
  ranked: RankedSearchItem<T>[]
) {
  const top = ranked[0];
  return {
    query,
    topResult:
      String(top?.item?.title || top?.item?.name || top?.item?.artist || "") || null,
    topScore: top?.score ?? 0,
    topReason: top?.reason ?? "none",
    directMatchCount: countDirectSearchMatches(ranked),
    fallbackDemotedCount: countFallbackDemoted(ranked),
    resultCount: ranked.length,
  };
}

export {
  rankSearchSongs,
  unwrapRankedSearchItems,
} from "./searchRanking";
