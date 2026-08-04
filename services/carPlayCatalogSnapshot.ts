import type { AndroidAutoBrowseItem, AndroidAutoCatalogSnapshot, AndroidAutoTrackPayload } from "./androidAutoCatalogSync";
import type { HiddenTunesDerivedCatalog, HiddenTunesSong } from "./hiddenTunes";

export const CARPLAY_LIMITS = {
  recentlyAdded: 24, artists: 24, songsPerArtist: 24, albums: 24,
  tracksPerAlbum: 24, genres: 16, tracksPerGenre: 24, playlists: 12,
  tracksPerPlaylist: 24, radio: 12, recentlyPlayed: 8, recommended: 8, tracks: 80,
} as const;

export type CarPlaySnapshotExtras = {
  favoriteItems?: AndroidAutoBrowseItem[];
  favoriteTracks?: AndroidAutoTrackPayload[];
  recentlyPlayedItems?: AndroidAutoBrowseItem[];
  recentlyPlayedTracks?: AndroidAutoTrackPayload[];
};

const MUSIC_FOLDERS: AndroidAutoBrowseItem[] = [
  { mediaId: "recently_added", title: "Recently Added", subtitle: "Latest songs", playable: false },
  { mediaId: "artists", title: "Artists", subtitle: "Browse by artist", playable: false },
  { mediaId: "albums", title: "Albums", subtitle: "Browse by album", playable: false },
  { mediaId: "genres", title: "Genres", subtitle: "Browse by genre", playable: false },
  { mediaId: "playlists", title: "Playlists", subtitle: "Collections", playable: false },
];

const ROOTS: AndroidAutoBrowseItem[] = [
  { mediaId: "recently_played", title: "Recently Played", subtitle: "Pick up where you left off", playable: false },
  { mediaId: "favorites", title: "Favorites", subtitle: "Saved on your phone", playable: false },
  { mediaId: "made_for_you", title: "Made for You", subtitle: "Recommended listening", playable: false },
  { mediaId: "music", title: "Music", subtitle: "Songs and collections", playable: false },
  { mediaId: "radio", title: "Radio", subtitle: "Live stations", playable: false },
];

function emptyItem(parentId: string): AndroidAutoBrowseItem {
  return { mediaId: `empty:${parentId}`, title: "Nothing here yet", subtitle: "Hidden Tunes", playable: false };
}

function safeToken(value: unknown) {
  return String(value || "").trim().toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80);
}

function rawFlag(record: Record<string, unknown>, key: string) {
  return record[key] === true || record[key] === 1 || record[key] === "true";
}

export function isSafePlayableCarPlaySong(song: HiddenTunesSong): boolean {
  const raw = song as unknown as Record<string, unknown>;
  const rating = String(raw.content_rating || raw.contentRating || "").toLowerCase();
  const status = String(raw.status || "").toLowerCase();
  return Boolean(String(song.id || "").trim() && String(song.title || "").trim()
      && String(song.streamUrl || song.url || "").trim())
    && song.isOnline !== false && raw.isPublic !== false && raw.is_public !== false
    && raw.public !== false && raw.playable !== false && !rawFlag(raw, "disabled")
    && !rawFlag(raw, "quarantined") && !rawFlag(raw, "is_quarantined")
    && status !== "quarantined" && !rawFlag(raw, "mature")
    && !rawFlag(raw, "is_mature") && !rawFlag(raw, "explicit")
    && rating !== "explicit" && rating !== "adult";
}

function trackPayload(song: HiddenTunesSong): AndroidAutoTrackPayload {
  return {
    mediaId: `song:${String(song.id).trim()}`, id: String(song.id).trim(),
    url: String(song.streamUrl || song.url || "").trim(), title: String(song.title).trim(),
    artist: String(song.artist || "Hidden Tunes").trim() || "Hidden Tunes",
    album: String(song.album || ""), artworkUrl: String(song.artwork || song.cover || song.thumbnail || ""),
    durationSeconds: typeof song.duration === "number" && song.duration > 0 ? song.duration : 0,
    contentType: String(song.id).startsWith("radio-") ? "radio" : "music",
    isLive: String(song.id).startsWith("radio-"),
  };
}

function playableNode(song: HiddenTunesSong): AndroidAutoBrowseItem {
  return {
    mediaId: `song:${String(song.id).trim()}`, title: String(song.title).trim(),
    subtitle: String(song.artist || "Hidden Tunes").trim() || "Hidden Tunes", playable: true,
    artworkUrl: String(song.artwork || song.cover || song.thumbnail || ""), contentType: "music",
  };
}

function section(parentId: string, items: AndroidAutoBrowseItem[]) {
  return { parentId, items: items.length ? items : [emptyItem(parentId)] };
}

export function buildCarPlayCatalogSnapshot(
  catalog: HiddenTunesDerivedCatalog | null | undefined,
  extras: CarPlaySnapshotExtras = {}
): AndroidAutoCatalogSnapshot {
  const sections: AndroidAutoCatalogSnapshot["sections"] = [];
  const tracks: AndroidAutoTrackPayload[] = [];
  const trackIds = new Set<string>();
  const sourceSongs: HiddenTunesSong[] = [];
  const sourceIds = new Set<string>();

  for (const song of catalog?.songs || []) {
    const id = String(song.id || "").trim();
    if (!isSafePlayableCarPlaySong(song) || sourceIds.has(id)) continue;
    sourceIds.add(id); sourceSongs.push(song);
    if (sourceSongs.length >= CARPLAY_LIMITS.tracks) break;
  }

  for (const track of [
    ...(extras.favoriteTracks || []),
    ...(extras.recentlyPlayedTracks || []),
  ]) {
    if (!track.mediaId || !track.url || trackIds.has(track.mediaId) || tracks.length >= CARPLAY_LIMITS.tracks) continue;
    trackIds.add(track.mediaId); tracks.push(track);
  }

  const addSong = (song: HiddenTunesSong): AndroidAutoBrowseItem | null => {
    const payload = trackPayload(song);
    if (!trackIds.has(payload.mediaId)) {
      if (tracks.length >= CARPLAY_LIMITS.tracks) return null;
      trackIds.add(payload.mediaId); tracks.push(payload);
    }
    return playableNode(song);
  };
  const songItems = (songs: HiddenTunesSong[], limit: number) => {
    const out: AndroidAutoBrowseItem[] = []; const seen = new Set<string>();
    for (const song of songs) {
      const id = String(song.id || "").trim();
      if (!sourceIds.has(id) || seen.has(id)) continue;
      const item = addSong(song); if (!item) continue;
      seen.add(id); out.push(item); if (out.length >= limit) break;
    }
    return out;
  };

  const musicSongs = sourceSongs.filter((song) => !String(song.id).startsWith("radio-"));
  const recent = songItems(musicSongs, CARPLAY_LIMITS.recentlyAdded);
  sections.push(section("recently_added", recent));

  const addFolders = <T>(parentId: string, prefix: string, values: T[], limit: number,
    title: (v: T) => string, subtitle: (v: T) => string, songs: (v: T) => HiddenTunesSong[],
    childLimit: number, identity: (v: T) => unknown) => {
    const folders: AndroidAutoBrowseItem[] = []; const ids = new Set<string>();
    for (const value of values) {
      const token = safeToken(identity(value)); if (!token) continue;
      const mediaId = `${prefix}:${token}`; if (ids.has(mediaId)) continue;
      ids.add(mediaId);
      folders.push({ mediaId, title: title(value), subtitle: subtitle(value), playable: false });
      sections.push(section(mediaId, songItems(songs(value), childLimit)));
      if (folders.length >= limit) break;
    }
    sections.push(section(parentId, folders));
  };

  addFolders("artists", "artist", catalog?.artists || [], CARPLAY_LIMITS.artists,
    (v) => v.name, (v) => `${v.songs?.length || 0} songs`, (v) => v.songs || [],
    CARPLAY_LIMITS.songsPerArtist, (v) => v.id || v.name);
  addFolders("albums", "album", catalog?.albums || [], CARPLAY_LIMITS.albums,
    (v) => v.title, (v) => v.artist || "Hidden Tunes", (v) => v.songs || [],
    CARPLAY_LIMITS.tracksPerAlbum, (v) => v.id || `${v.artist}-${v.title}`);
  addFolders("genres", "genre", catalog?.genres || [], CARPLAY_LIMITS.genres,
    (v) => v.title, (v) => `${v.songs?.length || 0} tracks`, (v) => v.songs || [],
    CARPLAY_LIMITS.tracksPerGenre, (v) => v.id || v.title);
  addFolders("playlists", "playlist", catalog?.playlists || [], CARPLAY_LIMITS.playlists,
    (v) => v.title, (v) => v.description || "Collection", (v) => v.songs || [],
    CARPLAY_LIMITS.tracksPerPlaylist, (v) => v.id || v.title);

  sections.push({ parentId: "music", items: MUSIC_FOLDERS.map((item) => ({ ...item })) });
  const phoneRecent = (extras.recentlyPlayedItems || []).filter((item) =>
    item.playable && trackIds.has(item.mediaId)
  ).slice(0, CARPLAY_LIMITS.recentlyPlayed);
  sections.push(section("recently_played", phoneRecent.length ? phoneRecent : recent.slice(0, CARPLAY_LIMITS.recentlyPlayed)));
  sections.push(section("made_for_you", recent.slice(0, CARPLAY_LIMITS.recommended)));

  const favorites: AndroidAutoBrowseItem[] = [];
  for (const item of extras.favoriteItems || []) {
    if (!item.mediaId || !item.title || !item.playable || !trackIds.has(item.mediaId)) continue;
    if (!favorites.some((entry) => entry.mediaId === item.mediaId)) favorites.push(item);
    if (favorites.length >= 25) break;
  }
  sections.push(section("favorites", favorites));
  sections.push(section("radio", songItems(
    sourceSongs.filter((song) => String(song.id).startsWith("radio-")), CARPLAY_LIMITS.radio)));

  return { roots: ROOTS.map((item) => ({ ...item })), sections, tracks };
}

export function buildCarPlayInitialCatalogSnapshot(extras: CarPlaySnapshotExtras = {}) {
  return buildCarPlayCatalogSnapshot(null, extras);
}

export function carPlayCatalogSignature(snapshot: AndroidAutoCatalogSnapshot) {
  return JSON.stringify({
    roots: snapshot.roots.map((node) => [node.mediaId, node.playable ? 1 : 0]),
    sections: snapshot.sections.map((entry) => [entry.parentId,
      entry.items.map((node) => [node.mediaId, node.playable ? 1 : 0])]),
    tracks: snapshot.tracks.map((track) => [
      track.mediaId, track.id, track.url, track.title, track.artist,
      track.artworkUrl, track.contentType, track.isLive ? 1 : 0,
    ]),
  });
}
