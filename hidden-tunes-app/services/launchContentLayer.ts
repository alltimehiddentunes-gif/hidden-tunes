import type {
  HiddenTunesCloudPlaylist,
  HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";
import type { SharedDiscoverySnapshot } from "./discoveryCache";
import type { SmartRecommendationsBundle } from "./smartRecommendations";
import type { SmartRadioEntry } from "./smartRecommendations";
import { buildRecentlyDiscovered } from "./smartDiscovery";
import {
  buildFeaturedPodcastChips,
  buildFeaturedVideoChips,
  CONTINUE_EXPLORING_CHIPS,
  type LaunchContentChip,
} from "../utils/launchContentRegistry";
import { getSongDedupeKey } from "../utils/catalogDedupe";
import { schedulePersistLaunchContent } from "../utils/launchContentCache";

const DEFAULT_SONG_LIMIT = 8;
const DEFAULT_PLAYLIST_LIMIT = 4;
const DEFAULT_CHIP_LIMIT = 6;

export type LaunchContentSnapshot = {
  featuredPlaylists: HiddenTunesCloudPlaylist[];
  featuredWorlds: LaunchContentChip[];
  featuredGenres: LaunchContentChip[];
  featuredRadios: SmartRadioEntry[];
  featuredVideos: LaunchContentChip[];
  featuredPodcasts: LaunchContentChip[];
  trendingNow: HiddenTunesNormalizedSong[];
  newReleases: HiddenTunesNormalizedSong[];
  hiddenPicks: HiddenTunesNormalizedSong[];
  continueExploring: LaunchContentChip[];
};

export type LaunchContentInput = {
  songs: HiddenTunesNormalizedSong[];
  sharedDiscovery: SharedDiscoverySnapshot;
  smartRecommendations?: SmartRecommendationsBundle;
  playlists?: HiddenTunesCloudPlaylist[];
};

let cachedKey: string | null = null;
let cachedSnapshot: LaunchContentSnapshot | null = null;

function songIdentity(song: HiddenTunesNormalizedSong) {
  return String(song.id || song.streamUrl || song.url || "").trim();
}

function isPlayableSong(song: HiddenTunesNormalizedSong) {
  return Boolean(
    String(song.streamUrl || song.url || (song as { audioUrl?: string }).audioUrl || "").trim()
  );
}

function dedupePlayableSongs(songs: HiddenTunesNormalizedSong[], limit = DEFAULT_SONG_LIMIT) {
  const seen = new Set<string>();
  const unique: HiddenTunesNormalizedSong[] = [];

  songs.forEach((song) => {
    if (!isPlayableSong(song)) return;
    const key = getSongDedupeKey(song);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(song);
  });

  return unique.slice(0, limit);
}

function buildLaunchCacheKey(input: LaunchContentInput) {
  const songs = input.songs || [];
  const first = songIdentity(songs[0]);
  const last = songIdentity(songs[songs.length - 1]);
  const playlistHead = String(input.playlists?.[0]?.id || input.sharedDiscovery.rankedAlbums[0]?.id || "");
  const radioHead = String(input.smartRecommendations?.smartRadioEntries?.[0]?.id || "");

  return [
    `songs:${songs.length}:${first}:${last}`,
    `discovery:${input.sharedDiscovery.rankedSongs.length}:${input.sharedDiscovery.recentlyDiscovered.length}`,
    `playlists:${input.playlists?.length || 0}:${playlistHead}`,
    `radios:${radioHead}`,
  ].join("::");
}

function buildFeaturedPlaylistsFromSongs(
  songs: HiddenTunesNormalizedSong[],
  limit = DEFAULT_PLAYLIST_LIMIT
): HiddenTunesCloudPlaylist[] {
  const newestSongs = buildRecentlyDiscovered(songs, 40);
  const afroSongs = songs.filter((song) =>
    `${song.genre || ""} ${song.mood || ""} ${song.title || ""}`
      .toLowerCase()
      .includes("afro")
  );
  const gospelSongs = songs.filter((song) =>
    `${song.genre || ""} ${song.mood || ""} ${song.title || ""}`
      .toLowerCase()
      .match(/gospel|worship|praise/)
  );
  const instrumentalSongs = songs.filter((song) =>
    `${song.genre || ""} ${song.title || ""}`.toLowerCase().includes("instrumental")
  );

  const playlists: HiddenTunesCloudPlaylist[] = [
    {
      id: "launch-featured-mix",
      title: "Hidden Tunes Featured Mix",
      description: "Staff-curated highlights from the catalog.",
      artwork: newestSongs[0]?.artwork,
      tracks: dedupePlayableSongs(newestSongs, 24),
    },
    {
      id: "launch-afro-mix",
      title: "Afro Heat Mix",
      description: "Afrobeats and Afro-fusion energy.",
      artwork: afroSongs[0]?.artwork,
      tracks: dedupePlayableSongs(afroSongs, 24),
    },
    {
      id: "launch-gospel-mix",
      title: "Worship & Gospel Mix",
      description: "Faith-filled listening rooms.",
      artwork: gospelSongs[0]?.artwork,
      tracks: dedupePlayableSongs(gospelSongs, 24),
    },
    {
      id: "launch-focus-mix",
      title: "Focus & Instrumentals",
      description: "Instrumentals for calm and focus.",
      artwork: instrumentalSongs[0]?.artwork,
      tracks: dedupePlayableSongs(instrumentalSongs, 24),
    },
  ];

  return playlists.filter((playlist) => playlist.tracks.length > 0).slice(0, limit);
}

function buildWorldChips(
  sharedDiscovery: SharedDiscoverySnapshot,
  limit = DEFAULT_CHIP_LIMIT
): LaunchContentChip[] {
  return sharedDiscovery.launchWorlds.slice(0, limit).map((world) => ({
    id: `world-${world.worldId || world.id}`,
    title: world.title,
    subtitle: world.subtitle,
    icon: "planet-outline" as const,
    pathname: "/genre",
    worldId: world.worldId || world.id.replace(/^world-/, ""),
  }));
}

function buildGenreChips(
  sharedDiscovery: SharedDiscoverySnapshot,
  limit = DEFAULT_CHIP_LIMIT
): LaunchContentChip[] {
  return sharedDiscovery.genreHubs.slice(0, limit).map((hub) => ({
    id: `genre-${hub.id}`,
    title: hub.genreTitle || hub.title,
    subtitle: hub.subtitle,
    icon: "musical-notes-outline",
    pathname: "/genre",
    params: {
      id: hub.id.replace(/^genre-/, ""),
      title: hub.genreTitle || hub.title,
      query: hub.genreTitle || hub.title,
      type: "genre",
    },
  }));
}

function buildHiddenPicks(
  sharedDiscovery: SharedDiscoverySnapshot,
  limit = DEFAULT_SONG_LIMIT
) {
  const curatedSongs = sharedDiscovery.curatedSections.flatMap((section) => section.songs);
  const recommended = sharedDiscovery.smartRecommendations?.recommendedForYou || [];

  return dedupePlayableSongs([...curatedSongs, ...recommended], limit);
}

function buildTrendingNow(
  sharedDiscovery: SharedDiscoverySnapshot,
  songs: HiddenTunesNormalizedSong[],
  limit = DEFAULT_SONG_LIMIT
) {
  return dedupePlayableSongs(
    [
      ...sharedDiscovery.rankedSongs,
      ...sharedDiscovery.recentlyDiscovered,
      ...songs,
    ],
    limit
  );
}

function buildLaunchContentSnapshot(input: LaunchContentInput): LaunchContentSnapshot {
  const songs = input.songs || [];
  const sharedDiscovery = input.sharedDiscovery;
  const smartRecommendations = input.smartRecommendations || sharedDiscovery.smartRecommendations;

  const featuredPlaylists =
    input.playlists?.length
      ? input.playlists.slice(0, DEFAULT_PLAYLIST_LIMIT)
      : buildFeaturedPlaylistsFromSongs(songs, DEFAULT_PLAYLIST_LIMIT);

  const featuredWorlds = buildWorldChips(sharedDiscovery, DEFAULT_CHIP_LIMIT);
  const featuredGenres = buildGenreChips(sharedDiscovery, DEFAULT_CHIP_LIMIT);
  const featuredRadios = (smartRecommendations?.smartRadioEntries || sharedDiscovery.smartRadioEntries || []).slice(
    0,
    4
  );
  const featuredVideos = buildFeaturedVideoChips(DEFAULT_CHIP_LIMIT);
  const featuredPodcasts = buildFeaturedPodcastChips(DEFAULT_CHIP_LIMIT);

  return {
    featuredPlaylists,
    featuredWorlds,
    featuredGenres,
    featuredRadios,
    featuredVideos,
    featuredPodcasts,
    trendingNow: buildTrendingNow(sharedDiscovery, songs),
    newReleases: dedupePlayableSongs(sharedDiscovery.recentlyDiscovered, DEFAULT_SONG_LIMIT),
    hiddenPicks: buildHiddenPicks(sharedDiscovery),
    continueExploring: CONTINUE_EXPLORING_CHIPS,
  };
}

export function getLaunchContentSnapshot(input: LaunchContentInput): LaunchContentSnapshot {
  const key = buildLaunchCacheKey(input);

  if (cachedKey === key && cachedSnapshot) {
    return cachedSnapshot;
  }

  const snapshot = buildLaunchContentSnapshot(input);
  cachedKey = key;
  cachedSnapshot = snapshot;
  schedulePersistLaunchContent(key, snapshot);

  return snapshot;
}

export function resetLaunchContentCache() {
  cachedKey = null;
  cachedSnapshot = null;
}

export function peekLaunchContentSnapshot() {
  return cachedSnapshot;
}
