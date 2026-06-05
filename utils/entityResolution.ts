import {
  buildCatalogTarget,
  getComparableKeys,
  matchSongsForCatalogTarget,
  normalizeCatalogKey,
  normalizeCatalogText,
  type CatalogResolverType,
  type CatalogSongLike,
} from "./catalogResolver";
import {
  logEntityResolveEmpty,
  logEntityResolveFallbackUsed,
  logEntityResolveStart,
  logEntityResolveSuccess,
  logEntityTracksResolved,
  type EntityDiagnosticKind,
} from "./entityDiagnostics";
import type {
  HiddenTunesAlbumCatalogItem,
  HiddenTunesArtistCatalogItem,
  HiddenTunesCatalogPlaylist,
  HiddenTunesDerivedCatalog,
  HiddenTunesSong,
} from "../services/hiddenTunes";

export type EntityResolveResult = {
  entity: unknown;
  tracks: HiddenTunesSong[];
  albums: HiddenTunesAlbumCatalogItem[];
  recoveryLabel?: string;
  resolvePath: string;
  usedFallback: boolean;
  isEmpty: boolean;
};

export const RELATED_SONGS_LABEL = "Related songs";

export function normalizeEntityKey(value: unknown) {
  return normalizeCatalogKey(value);
}

export function slugifyEntityKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value: unknown) {
  return normalizeCatalogText(value);
}

function songArtistName(song: HiddenTunesSong) {
  return String(song.artist || (song as { user?: { name?: string } }).user?.name || "")
    .trim();
}

function dedupeSongs(songs: HiddenTunesSong[]) {
  const seen = new Set<string>();
  const output: HiddenTunesSong[] = [];

  songs.forEach((song) => {
    const key = String(song.id || `${song.title}-${song.artist}`).toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(song);
  });

  return output;
}

function getTrackSortValue(track: HiddenTunesSong, fallbackIndex: number) {
  const raw = (track as { raw?: Record<string, unknown> }).raw || {};
  const candidates = [
    (track as { trackNumber?: unknown }).trackNumber,
    (track as { track_number?: unknown }).track_number,
    raw.trackNumber,
    raw.track_number,
    raw.position,
    raw.order,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return fallbackIndex + 10000;
}

export function sortAlbumEntityTracks(songs: HiddenTunesSong[]) {
  return songs
    .map((song, index) => ({ song, index }))
    .sort((left, right) => {
      const leftSort = getTrackSortValue(left.song, left.index);
      const rightSort = getTrackSortValue(right.song, right.index);
      if (leftSort !== rightSort) return leftSort - rightSort;
      return String(left.song.title || "").localeCompare(String(right.song.title || ""));
    })
    .map((item) => item.song);
}

function keysMatch(left: unknown, right: unknown) {
  const leftKeys = getComparableKeys(left);
  const rightKeys = getComparableKeys(right);
  if (!leftKeys.length || !rightKeys.length) return false;
  return leftKeys.some((key) => rightKeys.includes(key));
}

function slugKeysMatch(left: unknown, right: unknown) {
  const leftSlug = slugifyEntityKey(left);
  const rightSlug = slugifyEntityKey(right);
  return Boolean(leftSlug && rightSlug && leftSlug === rightSlug);
}

function albumMatchesSong(
  albumTitle: string,
  artistName: string,
  song: HiddenTunesSong
) {
  const normalizedAlbum = cleanText(albumTitle);
  const normalizedArtist = cleanText(artistName);
  const songAlbum = cleanText(song.album || "");
  const songArtist = cleanText(songArtistName(song));

  const albumMatches =
    keysMatch(normalizedAlbum, songAlbum) || slugKeysMatch(normalizedAlbum, songAlbum);
  const artistMatches =
    !normalizedArtist ||
    normalizedArtist === "unknown artist" ||
    keysMatch(normalizedArtist, songArtist) ||
    slugKeysMatch(normalizedArtist, songArtist);

  return albumMatches && artistMatches;
}

function artistMatchesSong(artistName: string, song: HiddenTunesSong) {
  const normalizedArtist = cleanText(artistName);
  const songArtist = cleanText(songArtistName(song));
  return (
    keysMatch(normalizedArtist, songArtist) ||
    slugKeysMatch(normalizedArtist, songArtist)
  );
}

function buildRelatedSongs(
  songs: HiddenTunesSong[],
  allSongs: HiddenTunesSong[],
  hint: string,
  limit = 24
) {
  const hintKeys = getComparableKeys(hint);
  if (!hintKeys.length) return [];

  const related = allSongs.filter((song) => {
    const searchable = [
      song.title,
      song.artist,
      song.album,
      song.genre,
      song.mood,
      song.lyrics,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return hintKeys.some((key) => {
      if (!key || key.length <= 2) return false;
      return searchable.includes(key);
    });
  });

  const songIds = new Set(songs.map((song) => song.id));
  return dedupeSongs(related.filter((song) => !songIds.has(song.id))).slice(0, limit);
}

function deriveAlbumFromSongs(
  title: string,
  artist: string,
  songs: HiddenTunesSong[],
  artwork?: string
): HiddenTunesAlbumCatalogItem {
  const lead = songs[0];
  return {
    id: slugifyEntityKey(`${artist}:${title}`),
    title: title || lead?.album || "Singles",
    artist: artist || songArtistName(lead) || "Unknown Artist",
    artwork:
      artwork ||
      lead?.artwork ||
      lead?.cover ||
      songs.find((song) => song.artwork || song.cover)?.cover ||
      "",
    songs,
  };
}

function deriveArtistFromSongs(
  name: string,
  songs: HiddenTunesSong[],
  albums: HiddenTunesAlbumCatalogItem[] = []
): HiddenTunesArtistCatalogItem {
  const lead = songs[0];
  return {
    id: slugifyEntityKey(name),
    name: name || songArtistName(lead) || "Unknown Artist",
    artwork:
      lead?.artwork ||
      lead?.cover ||
      songs.find((song) => song.artwork || song.cover)?.cover ||
      "",
    songs,
    albums,
  };
}

function finalizeEntityResolve(
  kind: EntityDiagnosticKind,
  result: EntityResolveResult,
  meta: Record<string, unknown> = {}
) {
  logEntityTracksResolved(kind, {
    trackCount: result.tracks.length,
    resolvePath: result.resolvePath,
    usedFallback: result.usedFallback,
    recoveryLabel: result.recoveryLabel,
    ...meta,
  });

  if (result.tracks.length) {
    logEntityResolveSuccess(kind, {
      trackCount: result.tracks.length,
      resolvePath: result.resolvePath,
      usedFallback: result.usedFallback,
      ...meta,
    });
  } else {
    logEntityResolveEmpty(kind, { resolvePath: result.resolvePath, ...meta });
  }

  if (result.usedFallback) {
    logEntityResolveFallbackUsed(kind, {
      resolvePath: result.resolvePath,
      recoveryLabel: result.recoveryLabel,
      ...meta,
    });
  }

  return result;
}

export function resolveAlbumEntity(
  catalog: HiddenTunesDerivedCatalog | null,
  params: {
    id?: string;
    album?: string;
    title?: string;
    artist?: string;
    thumbnail?: string;
  }
): EntityResolveResult {
  const albumTitle = String(params.album || params.title || "Singles").trim();
  const artistName = String(params.artist || "Unknown Artist").trim();
  const albumId = String(params.id || "").trim();
  const songs = catalog?.songs || [];
  const albums = catalog?.albums || [];

  logEntityResolveStart("album", { albumTitle, artistName, albumId });

  let resolvePath = "direct";
  let usedFallback = false;
  let recoveryLabel: string | undefined;
  let matchedAlbum: HiddenTunesAlbumCatalogItem | undefined;
  let tracks: HiddenTunesSong[] = [];

  if (albumId) {
    matchedAlbum = albums.find(
      (item) =>
        item.id === albumId ||
        slugifyEntityKey(item.id) === slugifyEntityKey(albumId) ||
        slugifyEntityKey(item.title) === slugifyEntityKey(albumId)
    );
    if (matchedAlbum) resolvePath = "album_id";
  }

  if (!matchedAlbum) {
    matchedAlbum = albums.find((item) => {
      const titleMatch =
        cleanText(item.title) === cleanText(albumTitle) ||
        keysMatch(item.title, albumTitle);
      const artistMatch =
        cleanText(artistName) === "unknown artist" ||
        cleanText(item.artist) === cleanText(artistName) ||
        keysMatch(item.artist, artistName);
      return titleMatch && artistMatch;
    });
    if (matchedAlbum) resolvePath = "album_title_artist";
  }

  if (!matchedAlbum) {
    matchedAlbum = albums.find(
      (item) =>
        keysMatch(item.title, albumTitle) ||
        slugKeysMatch(item.title, albumTitle)
    );
    if (matchedAlbum) {
      resolvePath = "album_normalized_title";
      usedFallback = true;
    }
  }

  if (matchedAlbum?.songs?.length) {
    tracks = sortAlbumEntityTracks(matchedAlbum.songs);
  }

  if (!tracks.length && albumId) {
    const byAlbumId = songs.filter((song) => {
      const raw = song as {
        albumId?: string;
        album_id?: string;
        albumTitle?: string;
        album_title?: string;
        release?: string;
        collection?: string;
      };
      const songAlbumId = String(raw.albumId || raw.album_id || "").trim();
      if (
        songAlbumId &&
        (songAlbumId === albumId || slugifyEntityKey(songAlbumId) === slugifyEntityKey(albumId))
      ) {
        return true;
      }
      const songAlbumTitle = String(raw.albumTitle || raw.album_title || song.album || "").trim();
      const titleMatch =
        keysMatch(songAlbumTitle, albumTitle) || slugKeysMatch(songAlbumTitle, albumTitle);
      const artistMatch =
        cleanText(artistName) === "unknown artist" ||
        artistMatchesSong(artistName, song);
      return titleMatch && artistMatch;
    });
    if (byAlbumId.length) {
      tracks = sortAlbumEntityTracks(byAlbumId);
      resolvePath = "catalog_songs_album_id";
      usedFallback = true;
    }
  }

  if (!tracks.length) {
    const catalogMatches = songs.filter((song) => albumMatchesSong(albumTitle, artistName, song));
    if (catalogMatches.length) {
      tracks = sortAlbumEntityTracks(catalogMatches);
      resolvePath = "catalog_songs_album_artist";
    }
  }

  if (!tracks.length) {
    const titleOnly = songs.filter(
      (song) =>
        keysMatch(song.album, albumTitle) || slugKeysMatch(song.album, albumTitle)
    );
    if (titleOnly.length) {
      tracks = sortAlbumEntityTracks(titleOnly);
      resolvePath = "catalog_songs_album_title";
      usedFallback = true;
    }
  }

  if (!tracks.length) {
    const related = buildRelatedSongs([], songs, `${albumTitle} ${artistName}`);
    if (related.length) {
      tracks = sortAlbumEntityTracks(related);
      resolvePath = "related_songs";
      usedFallback = true;
      recoveryLabel = RELATED_SONGS_LABEL;
    }
  }

  const entity =
    matchedAlbum ||
    (tracks.length
      ? deriveAlbumFromSongs(albumTitle, artistName, tracks, params.thumbnail)
      : null);

  return finalizeEntityResolve(
    "album",
    {
      entity,
      tracks,
      albums: entity ? [entity as HiddenTunesAlbumCatalogItem] : [],
      recoveryLabel,
      resolvePath,
      usedFallback,
      isEmpty: tracks.length === 0,
    },
    { albumTitle, artistName, albumId }
  );
}

export function resolveArtistEntity(
  catalog: HiddenTunesDerivedCatalog | null,
  params: { id?: string; artist?: string; name?: string }
): EntityResolveResult {
  const artistName = String(params.artist || params.name || "Unknown Artist").trim();
  const artistId = String(params.id || "").trim();
  const songs = catalog?.songs || [];
  const artists = catalog?.artists || [];
  const albums = catalog?.albums || [];

  logEntityResolveStart("artist", { artistName, artistId });

  let resolvePath = "direct";
  let usedFallback = false;
  let recoveryLabel: string | undefined;
  let matchedArtist: HiddenTunesArtistCatalogItem | undefined;
  let tracks: HiddenTunesSong[] = [];

  if (artistId) {
    matchedArtist = artists.find(
      (item) =>
        item.id === artistId ||
        slugifyEntityKey(item.id) === slugifyEntityKey(artistId) ||
        slugifyEntityKey(item.name) === slugifyEntityKey(artistId)
    );
    if (matchedArtist) resolvePath = "artist_id";
  }

  if (!matchedArtist) {
    matchedArtist = artists.find(
      (item) =>
        keysMatch(item.name, artistName) || slugKeysMatch(item.name, artistName)
    );
    if (matchedArtist) resolvePath = "artist_name";
  }

  if (matchedArtist?.songs?.length) {
    tracks = dedupeSongs(matchedArtist.songs);
  }

  if (!tracks.length) {
    const catalogMatches = songs.filter((song) => artistMatchesSong(artistName, song));
    if (catalogMatches.length) {
      tracks = dedupeSongs(catalogMatches);
      resolvePath = matchedArtist ? "catalog_songs_artist" : "catalog_songs_only";
    }
  }

  if (!tracks.length) {
    const partial = songs.filter((song) => {
      const songArtist = cleanText(songArtistName(song));
      const target = cleanText(artistName);
      return songArtist.includes(target) || target.includes(songArtist);
    });
    if (partial.length) {
      tracks = dedupeSongs(partial);
      resolvePath = "artist_partial_name";
      usedFallback = true;
    }
  }

  if (!tracks.length) {
    const related = buildRelatedSongs([], songs, artistName);
    if (related.length) {
      tracks = dedupeSongs(related);
      resolvePath = "related_songs";
      usedFallback = true;
      recoveryLabel = RELATED_SONGS_LABEL;
    }
  }

  const artistAlbums = albums.filter(
    (album) =>
      keysMatch(album.artist, artistName) ||
      tracks.some((song) => albumMatchesSong(album.title, album.artist, song))
  );

  const entity =
    matchedArtist ||
    (tracks.length
      ? deriveArtistFromSongs(artistName, tracks, artistAlbums)
      : null);

  return finalizeEntityResolve(
    "artist",
    {
      entity,
      tracks,
      albums: artistAlbums,
      recoveryLabel,
      resolvePath,
      usedFallback,
      isEmpty: tracks.length === 0,
    },
    { artistName, artistId }
  );
}

function roomSearchTerms(value: string) {
  const normalized = cleanText(value)
    .replace(/\b(station|room|radio)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(
    new Set([cleanText(value), normalized, ...normalized.split(" ")].filter(Boolean))
  );
}

export function resolveGenreRoomEntity(
  catalog: HiddenTunesDerivedCatalog | null,
  params: {
    id?: string;
    title?: string;
    query?: string;
    type?: string;
  }
): EntityResolveResult {
  const title = String(params.title || params.query || "Genre").trim();
  const rawType = String(params.type || "genre").toLowerCase();
  const resolverType: CatalogResolverType =
    rawType === "mood" ? "mood" : rawType === "station" || rawType === "radio" ? "category" : "genre";
  const diagnosticKind: EntityDiagnosticKind =
    rawType === "mood" ? "mood" : rawType === "station" || rawType === "radio" ? "station" : "genre";
  const songs = catalog?.songs || [];

  logEntityResolveStart(diagnosticKind, { title, type: rawType, id: params.id });

  let resolvePath = "direct";
  let usedFallback = false;
  let recoveryLabel: string | undefined;
  let tracks: HiddenTunesSong[] = [];

  const target = buildCatalogTarget({
    type: resolverType,
    id: params.id,
    title,
    query: params.query || title,
  });

  const catalogMatches = matchSongsForCatalogTarget(
    songs as unknown as CatalogSongLike[],
    target
  ) as unknown as HiddenTunesSong[];
  if (catalogMatches.length) {
    tracks = dedupeSongs(catalogMatches);
    resolvePath = "catalog_target";
  }

  if (!tracks.length) {
    const genreItem = (catalog?.genres || []).find(
      (item) =>
        keysMatch(item.title, title) ||
        slugKeysMatch(item.title, title) ||
        slugifyEntityKey(item.id) === slugifyEntityKey(params.id || title)
    );
    if (genreItem?.songs?.length) {
      tracks = dedupeSongs(genreItem.songs);
      resolvePath = "genre_catalog_item";
    }
  }

  if (!tracks.length) {
    const terms = roomSearchTerms(title);
    const partial = songs.filter((song) => {
      const searchable = [song.genre, song.mood, song.album, song.title, song.artist, song.lyrics]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.some((term) => searchable.includes(term));
    });
    if (partial.length) {
      tracks = dedupeSongs(partial);
      resolvePath = "tag_mood_partial";
      usedFallback = true;
    }
  }

  if (!tracks.length) {
    const related = buildRelatedSongs([], songs, title);
    if (related.length) {
      tracks = dedupeSongs(related);
      resolvePath = "related_songs";
      usedFallback = true;
      recoveryLabel = RELATED_SONGS_LABEL;
    }
  }

  const trackIds = new Set(tracks.map((song) => song.id));
  const matchedAlbums = (catalog?.albums || []).filter((album) =>
    album.songs.some((song) => trackIds.has(song.id))
  );

  const entity = {
    id: params.id || slugifyEntityKey(title),
    title,
    query: params.query || title,
    type: rawType,
    artwork: tracks[0]?.artwork || tracks[0]?.cover || "",
  };

  return finalizeEntityResolve(
    diagnosticKind,
    {
      entity,
      tracks,
      albums: matchedAlbums,
      recoveryLabel,
      resolvePath,
      usedFallback,
      isEmpty: tracks.length === 0,
    },
    { title, type: rawType }
  );
}

export function resolveStationEntity(
  catalog: HiddenTunesDerivedCatalog | null,
  params: {
    id?: string;
    title?: string;
    query?: string;
    explicitTracks?: HiddenTunesSong[];
  }
): EntityResolveResult {
  const explicit = dedupeSongs(params.explicitTracks || []);
  if (explicit.length) {
    logEntityResolveStart("station", { title: params.title, trackCount: explicit.length });
    return finalizeEntityResolve(
      "station",
      {
        entity: {
          id: params.id || slugifyEntityKey(params.title || "station"),
          title: params.title || "Station",
        },
        tracks: explicit,
        albums: [],
        resolvePath: "explicit_station_tracks",
        usedFallback: false,
        isEmpty: false,
      },
      { title: params.title }
    );
  }

  return resolveGenreRoomEntity(catalog, {
    id: params.id,
    title: params.title,
    query: params.query,
    type: "station",
  });
}

function resolveSongByStoredRef(
  ref: unknown,
  songs: HiddenTunesSong[]
): HiddenTunesSong | null {
  const raw = String(ref || "").trim();
  if (!raw) return null;

  const direct = songs.find(
    (song) =>
      song.id === raw ||
      slugifyEntityKey(song.id) === slugifyEntityKey(raw)
  );
  if (direct) return direct;

  const normalizedRef = cleanText(raw);
  return (
    songs.find((song) => {
      const composite = cleanText(`${song.title}-${song.artist}`);
      return composite === normalizedRef || keysMatch(song.title, raw);
    }) || null
  );
}

export function resolvePlaylistEntity(
  catalog: HiddenTunesDerivedCatalog | null,
  params: { id?: string; title?: string },
  storedTracks: Array<Record<string, unknown>> = []
): EntityResolveResult {
  const playlistId = String(params.id || "").trim();
  const playlistTitle = String(params.title || "").trim();
  const songs = catalog?.songs || [];
  const playlists = catalog?.playlists || [];

  logEntityResolveStart("playlist", { playlistId, playlistTitle });

  let resolvePath = "direct";
  let usedFallback = false;
  let recoveryLabel: string | undefined;
  let tracks: HiddenTunesSong[] = [];
  let matchedPlaylist: HiddenTunesCatalogPlaylist | undefined;

  if (storedTracks.length) {
    const resolved = storedTracks
      .map((track) => {
        const id = String(track.id || track.videoId || "").trim();
        if (!id) return null;
        return (
          songs.find((song) => song.id === id || slugifyEntityKey(song.id) === slugifyEntityKey(id)) ||
          ({
            ...track,
            id,
            title: String(track.title || "Untitled"),
            artist: String(track.artist || "Hidden Tunes"),
            cover: String((track as { artwork?: string }).artwork || (track as { cover?: string }).cover || ""),
            streamUrl: String((track as { streamUrl?: string }).streamUrl || (track as { url?: string }).url || ""),
            isOnline: true,
          } as HiddenTunesSong)
        );
      })
      .filter(Boolean) as HiddenTunesSong[];

    if (resolved.length) {
      tracks = dedupeSongs(resolved);
      resolvePath = "stored_track_ids";
    }
  }

  if (!tracks.length && playlistId) {
    matchedPlaylist = playlists.find(
      (item) =>
        item.id === playlistId || slugifyEntityKey(item.id) === slugifyEntityKey(playlistId)
    );
    if (matchedPlaylist?.songs?.length) {
      tracks = dedupeSongs(matchedPlaylist.songs);
      resolvePath = "catalog_playlist";
    }
  }

  if (!tracks.length && playlistTitle) {
    matchedPlaylist = playlists.find(
      (item) =>
        keysMatch(item.title, playlistTitle) || slugKeysMatch(item.title, playlistTitle)
    );
    if (matchedPlaylist?.songs?.length) {
      tracks = dedupeSongs(matchedPlaylist.songs);
      resolvePath = "catalog_playlist_title";
      usedFallback = true;
    }
  }

  if (!tracks.length && storedTracks.length) {
    const fallback = storedTracks
      .map((track) =>
        resolveSongByStoredRef(
          track.id || `${track.title}-${track.artist}`,
          songs
        )
      )
      .filter(Boolean) as HiddenTunesSong[];

    if (fallback.length) {
      tracks = dedupeSongs(fallback);
      resolvePath = "stored_title_artist_fallback";
      usedFallback = true;
    }
  }

  if (!tracks.length) {
    const related = buildRelatedSongs([], songs, playlistTitle || playlistId);
    if (related.length) {
      tracks = dedupeSongs(related);
      resolvePath = "related_songs";
      usedFallback = true;
      recoveryLabel = RELATED_SONGS_LABEL;
    }
  }

  const entity =
    matchedPlaylist ||
    (tracks.length
      ? {
          id: playlistId || slugifyEntityKey(playlistTitle || "playlist"),
          title: playlistTitle || "Playlist",
          artwork: tracks.slice(0, 4).map((song) => song.artwork || song.cover).filter(Boolean),
          songs: tracks,
        }
      : null);

  return finalizeEntityResolve(
    "playlist",
    {
      entity,
      tracks,
      albums: [],
      recoveryLabel,
      resolvePath,
      usedFallback,
      isEmpty: tracks.length === 0,
    },
    { playlistId, playlistTitle }
  );
}

export function mergeApiTracksWithCatalogAlbum(
  apiTracks: HiddenTunesSong[],
  catalog: HiddenTunesDerivedCatalog | null,
  params: {
    id?: string;
    album?: string;
    title?: string;
    artist?: string;
    thumbnail?: string;
  }
) {
  if (apiTracks.length) return apiTracks;
  return resolveAlbumEntity(catalog, params).tracks;
}

export function mergeApiTracksWithCatalogArtist(
  apiTracks: HiddenTunesSong[],
  catalog: HiddenTunesDerivedCatalog | null,
  params: { id?: string; artist?: string; name?: string }
) {
  if (apiTracks.length) return apiTracks;
  return resolveArtistEntity(catalog, params).tracks;
}
