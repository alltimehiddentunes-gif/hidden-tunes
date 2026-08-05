import type { AndroidAutoBrowseItem, AndroidAutoCatalogSnapshot, AndroidAutoTrackPayload } from "./androidAutoCatalogSync";
import type { HiddenTunesDerivedCatalog, HiddenTunesSong } from "./hiddenTunes";
import {
  artworkDescriptor,
  dedupeCarPlayRows,
  formatCarPlaySubtitle,
  sanitizeCarPlayText,
  withCarPlayArtworkDescriptor,
} from "./carPlayPresentation";
import { allocateCarPlayRegistry } from "./carPlayPersonalization";

type CarPlayVisibilityItem = {
  isMature?: unknown; is_mature?: unknown; mature?: unknown; explicit?: unknown;
  contentRating?: unknown; content_rating?: unknown; matureLevel?: unknown;
};

let phoneMatureEnabled = () => false;

export function configureCarPlayMatureVisibility(readPhoneMatureEnabled: () => boolean) {
  phoneMatureEnabled = readPhoneMatureEnabled;
}

export function isCarPlayMatureContent(item: unknown) {
  if (!item || typeof item !== "object") return false;
  const candidate = item as CarPlayVisibilityItem;
  const rating = String(candidate.contentRating || candidate.content_rating
    || candidate.matureLevel || "").trim().toLowerCase();
  return rawFlag(candidate as Record<string, unknown>, "isMature")
    || rawFlag(candidate as Record<string, unknown>, "is_mature")
    || rawFlag(candidate as Record<string, unknown>, "mature")
    || rawFlag(candidate as Record<string, unknown>, "explicit")
    || rating === "explicit" || rating === "adult";
}

/** CarPlay consumes the existing phone mature-content decision; it never authenticates. */
export function isCarPlayContentVisible(item: unknown) {
  return !isCarPlayMatureContent(item) || phoneMatureEnabled();
}

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
  /** Ordered highest-priority first; admitted before general music. */
  premiumTracks?: AndroidAutoTrackPayload[];
  /** Replaces same-parent legacy sections and may add premium child folders. */
  premiumSections?: AndroidAutoCatalogSnapshot["sections"];
  /** Canonical bounded music ordering derived from persisted CarPlay-safe signals. */
  recommendedSongIds?: string[];
};

const ROOTS: AndroidAutoBrowseItem[] = [
  { mediaId: "listen", title: "Listen", subtitle: "Your listening", playable: false },
  { mediaId: "radio", title: "Radio", subtitle: "Live stations", playable: false },
  { mediaId: "library", title: "Library", subtitle: "Music, podcasts, and books", playable: false },
];

function emptyItem(parentId: string): AndroidAutoBrowseItem {
  const copy: Record<string, string> = {
    continue_listening: "Your unfinished listening will appear here.",
    recently_played: "Your recent listening will appear here.",
    favorites: "Favorite music will appear here.",
    made_for_you: "Recommendations will appear as you listen.",
    recommended_podcasts: "Podcast recommendations will appear as you listen.",
    radio_favorites: "Favorite stations will appear here.",
    radio_recent: "Your recent stations will appear here.",
    radio_recommended: "Station recommendations will appear as you listen.",
    radio_browse: "Stations will appear here.",
    podcasts: "Your podcast shows will appear here.",
    audiobooks: "Your audiobooks will appear here.",
  };
  return { mediaId: `empty:${parentId}`, title: copy[parentId] || "Audio will appear here.", subtitle: "", playable: false };
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
  const status = String(raw.status || "").toLowerCase();
  return Boolean(String(song.id || "").trim() && String(song.title || "").trim()
      && String(song.streamUrl || song.url || "").trim())
    && song.isOnline !== false && raw.isPublic !== false && raw.is_public !== false
    && raw.public !== false && raw.playable !== false && !rawFlag(raw, "disabled")
    && !rawFlag(raw, "quarantined") && !rawFlag(raw, "is_quarantined")
    && status !== "quarantined" && isCarPlayContentVisible(raw);
}

function trackPayload(song: HiddenTunesSong, collection = ""): AndroidAutoTrackPayload {
  return withCarPlayArtworkDescriptor({
    mediaId: `song:${String(song.id).trim()}`, id: String(song.id).trim(),
    url: String(song.streamUrl || song.url || "").trim(), title: String(song.title).trim(),
    artist: String(song.artist || "Hidden Tunes").trim() || "Hidden Tunes",
    album: String(song.album || ""), artworkUrl: String(song.artwork || song.cover || song.thumbnail || ""),
    durationSeconds: typeof song.duration === "number" && song.duration > 0 ? song.duration : 0,
    contentType: String(song.id).startsWith("radio-") ? "radio" : "music",
    isLive: String(song.id).startsWith("radio-"),
    isLiveStream: String(song.id).startsWith("radio-"),
    isMature: isCarPlayMatureContent(song as unknown as Record<string, unknown>),
    collection: sanitizeCarPlayText(collection, 160),
  } as AndroidAutoTrackPayload) as AndroidAutoTrackPayload;
}

function playableNode(song: HiddenTunesSong): AndroidAutoBrowseItem {
  return {
    mediaId: `song:${String(song.id).trim()}`, title: String(song.title).trim(),
    subtitle: formatCarPlaySubtitle(song.title, [song.artist || "Hidden Tunes", song.album]), playable: true,
    artworkUrl: String(song.artwork || song.cover || song.thumbnail || ""), contentType: "music",
  };
}

function section(parentId: string, items: AndroidAutoBrowseItem[]) {
  const rows = dedupeCarPlayRows(items.map((item) => {
    const raw = item as AndroidAutoBrowseItem & Record<string, unknown>;
    const content = String(raw.contentType || "music").toLowerCase();
    const fallback = content.includes("podcast") ? "podcast" : content.includes("audiobook") ? "audiobook"
      : content.includes("radio") ? "radio" : content.includes("artist") ? "artist"
        : content.includes("album") ? "album" : content.includes("playlist") ? "playlist" : "music";
    return { ...item, title: sanitizeCarPlayText(item.title) || "Hidden Tunes",
      subtitle: formatCarPlaySubtitle(item.title, [item.subtitle]),
      artworkDescriptor: raw.artworkDescriptor || artworkDescriptor(item.artworkUrl, fallback,
        item.playable ? "row" : "folder", "small"),
    } as AndroidAutoBrowseItem;
  }));
  return { parentId, items: rows.length ? rows : [emptyItem(parentId)] };
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
  const searchTermsBySongId = new Map<string, Set<string>>();
  const addSearchTerm = (songId: unknown, term: unknown) => {
    const id = String(songId || "").trim();
    const value = String(term || "").trim();
    if (!id || !value) return;
    const terms = searchTermsBySongId.get(id) || new Set<string>();
    terms.add(value);
    searchTermsBySongId.set(id, terms);
  };
  for (const playlist of catalog?.playlists || []) {
    for (const song of playlist.songs || []) addSearchTerm(song.id, playlist.title);
  }
  for (const genre of catalog?.genres || []) {
    for (const song of genre.songs || []) addSearchTerm(song.id, genre.title);
  }

  const premiumTracks = extras.premiumTracks || [];
  const allocatedPriorityTracks = allocateCarPlayRegistry([
    { priority: 1, quota: 6, items: premiumTracks.filter((track) =>
      Number((track as AndroidAutoTrackPayload & Record<string, unknown>).resumePositionMillis) > 0) },
    { priority: 2, quota: 12, items: extras.favoriteTracks || [] },
    { priority: 3, quota: 10, items: extras.recentlyPlayedTracks || [] },
    { priority: 4, quota: 16, items: premiumTracks.filter((track) => track.contentType === "podcast") },
    { priority: 5, quota: 12, items: premiumTracks.filter((track) => track.contentType === "radio") },
    { priority: 6, quota: 8, items: premiumTracks.filter((track) => track.contentType === "audiobook") },
    { priority: 7, quota: 4, items: premiumTracks },
  ], CARPLAY_LIMITS.tracks);
  for (const track of allocatedPriorityTracks) {
    if (!track.mediaId || !track.url || !isCarPlayContentVisible(track)
      || trackIds.has(track.mediaId) || tracks.length >= CARPLAY_LIMITS.tracks) continue;
    trackIds.add(track.mediaId); tracks.push(withCarPlayArtworkDescriptor(track) as AndroidAutoTrackPayload);
  }

  const addSong = (song: HiddenTunesSong): AndroidAutoBrowseItem | null => {
    const terms = [...(searchTermsBySongId.get(String(song.id || "").trim()) || [])];
    const raw = song as unknown as Record<string, unknown>;
    terms.push(String(raw.genre || raw.mood || ""));
    const payload = trackPayload(song, terms.filter(Boolean).join(" · "));
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

  const addFolders = <T>(parentId: string, prefix: string, values: T[], limit: number,
    title: (v: T) => string, subtitle: (v: T) => string, songs: (v: T) => HiddenTunesSong[],
    childLimit: number, identity: (v: T) => unknown) => {
    const folders: AndroidAutoBrowseItem[] = []; const ids = new Set<string>();
    for (const value of values) {
      const token = safeToken(identity(value)); if (!token) continue;
      const mediaId = `${prefix}:${token}`; if (ids.has(mediaId)) continue;
      ids.add(mediaId);
      const folderTitle = sanitizeCarPlayText(title(value)) || "Hidden Tunes";
      folders.push({ mediaId, title: folderTitle,
        subtitle: formatCarPlaySubtitle(folderTitle, [subtitle(value)]), playable: false,
        artworkDescriptor: artworkDescriptor("", prefix === "artist" ? "artist"
          : prefix === "album" ? "album" : prefix === "playlist" ? "playlist" : "music", "folder") } as AndroidAutoBrowseItem);
      sections.push(section(mediaId, songItems(songs(value), childLimit)));
      if (folders.length >= limit) break;
    }
    sections.push(section(parentId, folders));
  };

  const recommendedIds = new Set((extras.recommendedSongIds || []).map(String));
  const higherPriorityMusicIds = new Set([
    ...(extras.favoriteTracks || []), ...(extras.recentlyPlayedTracks || []),
    ...premiumTracks.filter((track) => Number(
      (track as AndroidAutoTrackPayload & Record<string, unknown>).resumePositionMillis
    ) > 0),
  ].map((track) => String(track.id || "")));
  const recommendedSongs = recommendedIds.size
    ? sourceSongs.filter((song) => recommendedIds.has(String(song.id))
      && !higherPriorityMusicIds.has(String(song.id))).sort((a, b) =>
      (extras.recommendedSongIds || []).indexOf(String(a.id)) - (extras.recommendedSongIds || []).indexOf(String(b.id)))
    : [];
  const recommendedItems = songItems(recommendedSongs, CARPLAY_LIMITS.recommended);
  const recent = songItems(musicSongs, CARPLAY_LIMITS.recentlyAdded);

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

  sections.push(section("music", recent));
  const phoneRecent = (extras.recentlyPlayedItems || []).filter((item) =>
    item.playable && trackIds.has(item.mediaId)
  ).slice(0, CARPLAY_LIMITS.recentlyPlayed);
  sections.push(section("recently_played", phoneRecent.length ? phoneRecent : recent.slice(0, CARPLAY_LIMITS.recentlyPlayed)));
  sections.push(section("made_for_you", recommendedItems));

  const favorites: AndroidAutoBrowseItem[] = [];
  for (const item of extras.favoriteItems || []) {
    if (!item.mediaId || !item.title || !item.playable || !trackIds.has(item.mediaId)) continue;
    if (!favorites.some((entry) => entry.mediaId === item.mediaId)) favorites.push(item);
    if (favorites.length >= 25) break;
  }
  sections.push(section("favorites", favorites));
  sections.push(section("radio", songItems(
    sourceSongs.filter((song) => String(song.id).startsWith("radio-")), CARPLAY_LIMITS.radio)));

  for (const premium of extras.premiumSections || []) {
    const parentId = String(premium.parentId || "").trim();
    if (!parentId) continue;
    const items = premium.items.filter((item) => {
      if (!item.playable) return Boolean(String(item.mediaId || "").trim());
      return trackIds.has(item.mediaId);
    });
    const replacement = section(parentId, items);
    const existingIndex = sections.findIndex((entry) => entry.parentId === parentId);
    if (existingIndex >= 0) sections[existingIndex] = replacement;
    else sections.push(replacement);
  }

  const legacyRadioItems = sections.find((entry) => entry.parentId === "radio")?.items
    .filter((item) => item.playable) || [];
  const browseIndex = sections.findIndex((entry) => entry.parentId === "radio_popular");
  if (legacyRadioItems.length && (browseIndex < 0
    || !sections[browseIndex].items.some((item) => item.playable))) {
    const fallbackBrowse = section("radio_popular", legacyRadioItems);
    if (browseIndex >= 0) sections[browseIndex] = fallbackBrowse;
    else sections.push(fallbackBrowse);
  }

  const folders = (values: Array<[string, string, string]>) => values.map(
    ([mediaId, title, subtitle]) => ({ mediaId, title, subtitle, playable: false })
  );
  const structuralSections: AndroidAutoCatalogSnapshot["sections"] = [
    { parentId: "listen", items: folders([
      ["continue_listening", "Continue Listening", "Unfinished listening"],
      ["recently_played", "Recently Played", "Your recent listening"],
      ["favorites", "Favorites", "Saved audio"],
      ["made_for_you", "Recommended", "Listening suggestions"],
      ["recommended_podcasts", "Recommended Podcasts", "Podcast suggestions"],
    ]) },
    { parentId: "radio", items: folders([
      ["radio_favorites", "Favorite Stations", "Saved stations"],
      ["radio_recent", "Recent Stations", "Recently played stations"],
      ["radio_recommended", "Recommended Stations", "Listening suggestions"],
      ["radio_browse", "Browse Stations", "Explore live radio"],
    ]) },
    { parentId: "radio_browse", items: folders([
      ["radio_country", "By Country", "Stations around the world"],
      ["radio_genre", "By Genre", "Browse listening styles"],
      ["radio_popular", "Popular", "Popular live stations"],
      ["radio_recently_added", "Recently Added", "New stations"],
    ]) },
    { parentId: "library", items: folders([
      ["artists", "Artists", "Browse by artist"],
      ["albums", "Albums", "Browse by album"],
      ["genres", "Genres", "Browse by genre"],
      ["playlists", "Playlists", "Your collections"],
      ["podcasts", "Podcasts", "Shows and episodes"],
      ["audiobooks", "Audiobooks", "Books and chapters"],
      ["music", "Saved Music", "Your music"],
    ]) },
  ];
  for (const structural of structuralSections) {
    const existingIndex = sections.findIndex((entry) => entry.parentId === structural.parentId);
    if (existingIndex >= 0) sections[existingIndex] = structural;
    else sections.push(structural);
  }
  for (const parentId of [
    "continue_listening", "recently_played", "favorites", "made_for_you",
    "recommended_podcasts", "radio_favorites", "radio_recent", "radio_recommended",
    "radio_browse", "artists", "albums", "genres", "playlists", "podcasts",
    "radio_country", "radio_genre", "radio_popular", "radio_recently_added",
    "audiobooks", "music",
  ]) {
    if (!sections.some((entry) => entry.parentId === parentId)) {
      sections.push(section(parentId, []));
    }
  }

  return { roots: ROOTS.map((item) => ({ ...item })), sections, tracks };
}

export function buildCarPlayInitialCatalogSnapshot(extras: CarPlaySnapshotExtras = {}) {
  return buildCarPlayCatalogSnapshot(null, extras);
}

export function carPlayCatalogSignature(snapshot: AndroidAutoCatalogSnapshot) {
  return JSON.stringify({
    roots: snapshot.roots.map((node) => [node.mediaId, node.title, node.subtitle, node.playable ? 1 : 0]),
    sections: snapshot.sections.map((entry) => [entry.parentId,
      entry.items.map((node) => [node.mediaId, node.title, node.subtitle, node.playable ? 1 : 0,
        ((node as AndroidAutoBrowseItem & Record<string, unknown>).artworkDescriptor as Record<string, unknown> | undefined)
          ?.cacheIdentity || ""])]),
    tracks: snapshot.tracks.map((track) => [
      ...(() => {
        const raw = track as AndroidAutoTrackPayload & Record<string, unknown>;
        return [raw.isMature ? 1 : 0, raw.showId || "", raw.episodeId || "",
          raw.bookId || "", raw.chapterId || "", Number(raw.resumePositionMillis) || 0,
          raw.stationId || "", raw.isLiveStream ? 1 : 0, raw.collection || ""];
      })(),
      track.mediaId, track.id, track.url, track.title, track.artist,
      track.artworkUrl, track.contentType, track.isLive ? 1 : 0,
    ]),
  });
}
