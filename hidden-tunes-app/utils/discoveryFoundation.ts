import { getArtworkUri } from "./artwork";
import { getSongDedupeKey } from "./catalogDedupe";
import { buildGenreSpotlightGroups } from "./exploreGenreGroups";
import {
  filterSongsForLaunchWorld,
  LAUNCH_EMOTIONAL_WORLDS,
  type LaunchEmotionalWorld,
} from "./launchEmotionalWorlds";

export type LaunchWorldSpotlight<T> = {
  id: string;
  title: string;
  subtitle: string;
  worldId: string;
  songs: T[];
  artwork: string[];
  artworkSong?: T;
  preview: string[];
  score: number;
  gradient: LaunchEmotionalWorld["gradient"];
};

export type GenreHubRow<T> = {
  id: string;
  title: string;
  subtitle: string;
  genreTitle: string;
  songs: T[];
  artwork: string[];
  score: number;
};

export type MoodCollectionRow<T> = {
  id: string;
  title: string;
  subtitle: string;
  worldId: string;
  songs: T[];
  artwork: string[];
  gradient: LaunchEmotionalWorld["gradient"];
  score: number;
};

type ArtworkSong = {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  artwork?: string;
  cover?: string;
  thumbnail?: string;
};

function artworkForSong(song: ArtworkSong) {
  return getArtworkUri(song, "");
}

function previewLine(song: { artist?: unknown; title?: unknown }) {
  const artist = String(song.artist || "Hidden Tunes").trim();
  const title = String(song.title || "Song").trim();
  return `${artist} · ${title}`;
}

function pickArtworkForGroup<T extends ArtworkSong>(
  songs: T[],
  usedArtworkKeys: Set<string>
) {
  for (const song of songs) {
    const url = artworkForSong(song);
    if (!url) continue;

    const key = getSongDedupeKey(song);
    if (usedArtworkKeys.has(key)) continue;

    usedArtworkKeys.add(key);
    return { url, song };
  }

  for (const song of songs) {
    const url = artworkForSong(song);
    if (!url) continue;
    return { url, song };
  }

  return { url: "", song: undefined as T | undefined };
}

export function buildLaunchWorldSpotlights<T extends ArtworkSong>(
  songs: T[],
  limit = 10
): LaunchWorldSpotlight<T>[] {
  const usedArtworkKeys = new Set<string>();

  const groups = LAUNCH_EMOTIONAL_WORLDS.map((world) => {
    const matched = filterSongsForLaunchWorld(songs, world);
    const { url, song: artworkSong } = pickArtworkForGroup(matched, usedArtworkKeys);

    return {
      id: `world-${world.id}`,
      worldId: world.id,
      title: world.title,
      subtitle: world.subtitle,
      songs: matched.slice(0, 10),
      artwork: url ? [url] : [],
      artworkSong,
      preview: matched.slice(0, 3).map(previewLine),
      score: matched.length,
      gradient: world.gradient,
    };
  });

  return groups.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function buildGenreHubRows<T extends ArtworkSong>(
  songs: T[],
  limit = 8
): GenreHubRow<T>[] {
  const groups = buildGenreSpotlightGroups(
    songs as Parameters<typeof buildGenreSpotlightGroups>[0],
    limit
  );

  return groups.map((group) => ({
    id: group.id,
    title: group.title,
    subtitle: group.subtitle,
    genreTitle: group.genreTitle,
    songs: group.songs as T[],
    artwork: group.artwork,
    score: group.score,
  }));
}

export function buildMoodCollectionRows<T extends ArtworkSong>(
  songs: T[],
  limit = 6
): MoodCollectionRow<T>[] {
  const moodWorldIds = new Set([
    "heartbreak-recovery",
    "late-night-vibes",
    "deep-focus",
    "night-drive",
  ]);
  const moodWorlds = LAUNCH_EMOTIONAL_WORLDS.filter((world) => moodWorldIds.has(world.id));
  const usedArtworkKeys = new Set<string>();

  const rows = moodWorlds.map((world) => {
    const matched = filterSongsForLaunchWorld(songs, world);
    const { url } = pickArtworkForGroup(matched, usedArtworkKeys);

    return {
      id: `mood-collection-${world.id}`,
      worldId: world.id,
      title: world.title,
      subtitle: world.subtitle,
      songs: matched.slice(0, 8),
      artwork: url ? [url] : [],
      gradient: world.gradient,
      score: matched.length,
    };
  });

  return rows.sort((a, b) => b.score - a.score).slice(0, limit);
}
