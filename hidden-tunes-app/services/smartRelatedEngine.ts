import { searchYouTubeBackend } from "./youtubeBackend";

import {
  RecentlyPlayedTrack,
  buildRecommendationSeedFromRecent,
  loadRecentlyPlayed,
} from "./recentlyPlayedEngine";

export type SmartRelatedTrack = {
  id: string;
  title: string;
  artist: string;
  channelTitle?: string;
  thumbnail?: string;
  cover?: string;
  sourceName: "YouTube";
  type: "youtube";
  isOnline: true;
};

function cleanText(value?: string) {
  return String(value || "")
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeTracks<T extends { id: string; title?: string }>(
  tracks: T[]
) {
  const seen = new Set<string>();

  return tracks.filter((track) => {
    const key = `${track.id}-${cleanText(
      track.title
    ).toLowerCase()}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function normalizeTrack(
  item: any
): SmartRelatedTrack | null {
  if (!item?.id || !item?.title) {
    return null;
  }

  const artist =
    item.artist ||
    item.channelTitle ||
    item.user?.name ||
    "Unknown Artist";

  return {
    id: String(item.id),

    title: String(item.title),

    artist: String(artist),

    channelTitle:
      item.channelTitle || artist,

    thumbnail: item.thumbnail,

    cover: item.thumbnail,

    sourceName: "YouTube",

    type: "youtube",

    isOnline: true,
  };
}

export async function getSmartRelatedSongs(
  seedTrack?: {
    title?: string;
    artist?: string;
    channelTitle?: string;
  }
) {
  const recent =
    await loadRecentlyPlayed();

  const title = cleanText(
    seedTrack?.title
  );

  const artist = cleanText(
    seedTrack?.artist ||
      seedTrack?.channelTitle
  );

  const personalSeed =
    buildRecommendationSeedFromRecent(
      recent as RecentlyPlayedTrack[]
    );

  const query = title
    ? `${artist} ${title} similar songs`
    : personalSeed ||
      "popular afrobeats songs";

  const results =
    await searchYouTubeBackend(query);

  const normalized = results
    .map(normalizeTrack)
    .filter(
      Boolean
    ) as SmartRelatedTrack[];

  return dedupeTracks(normalized).slice(
    0,
    25
  );
}

export async function getPersonalRadioSongs() {
  const recent =
    await loadRecentlyPlayed();

  const query =
    buildRecommendationSeedFromRecent(
      recent as RecentlyPlayedTrack[]
    );

  const results =
    await searchYouTubeBackend(query);

  const normalized = results
    .map(normalizeTrack)
    .filter(
      Boolean
    ) as SmartRelatedTrack[];

  return dedupeTracks(normalized).slice(
    0,
    30
  );
}