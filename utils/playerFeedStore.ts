import { useSyncExternalStore } from "react";

export type PlayerFeedRecentHead = {
  id?: string;
  title?: string;
  artist?: string;
};

export type PlayerFeedCurrentSongMeta = {
  id?: string;
  title?: string;
  artist?: string;
};

export type PlayerFeedSnapshot = {
  recentArtistSignature: string;
  favoriteArtistSignature: string;
  activeQueueSignature: string;
  recentHead: PlayerFeedRecentHead[];
  currentSongMeta: PlayerFeedCurrentSongMeta | null;
  recentlyPlayed: unknown[];
  favorites: unknown[];
  activeQueue: unknown[];
};

const EMPTY_SNAPSHOT: PlayerFeedSnapshot = {
  recentArtistSignature: "empty",
  favoriteArtistSignature: "empty",
  activeQueueSignature: "empty",
  recentHead: [],
  currentSongMeta: null,
  recentlyPlayed: [],
  favorites: [],
  activeQueue: [],
};

let snapshot: PlayerFeedSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

function buildArtistSignature(items: Array<{ artist?: unknown }>) {
  if (!items.length) return "empty";
  return Array.from(
    new Set(items.map((item) => String(item?.artist || "").toLowerCase()).filter(Boolean))
  )
    .sort()
    .join("|");
}

function buildSongListSignature(songs: Array<{ id?: unknown }>) {
  if (!songs.length) return "empty";
  return songs
    .map((song) => String(song?.id || ""))
    .filter(Boolean)
    .join("|");
}

function snapshotsEqual(a: PlayerFeedSnapshot, b: PlayerFeedSnapshot) {
  return (
    a.recentArtistSignature === b.recentArtistSignature &&
    a.favoriteArtistSignature === b.favoriteArtistSignature &&
    a.activeQueueSignature === b.activeQueueSignature &&
    a.currentSongMeta?.id === b.currentSongMeta?.id &&
    a.currentSongMeta?.title === b.currentSongMeta?.title &&
    a.currentSongMeta?.artist === b.currentSongMeta?.artist &&
    a.recentHead.length === b.recentHead.length &&
    a.recentHead.every(
      (item, index) =>
        item.id === b.recentHead[index]?.id &&
        item.title === b.recentHead[index]?.title &&
        item.artist === b.recentHead[index]?.artist
    )
  );
}

export function buildPlayerFeedSnapshot(input: {
  recentlyPlayed: unknown;
  favorites: unknown;
  activeQueue: unknown;
  currentSong: { id?: string; title?: string; artist?: string } | null;
}): PlayerFeedSnapshot {
  const recentlyPlayed = Array.isArray(input.recentlyPlayed)
    ? (input.recentlyPlayed as PlayerFeedRecentHead[])
    : [];
  const favorites = Array.isArray(input.favorites) ? input.favorites : [];
  const activeQueue = Array.isArray(input.activeQueue) ? input.activeQueue : [];

  return {
    recentArtistSignature: buildArtistSignature(recentlyPlayed),
    favoriteArtistSignature: buildArtistSignature(favorites),
    activeQueueSignature: buildSongListSignature(activeQueue),
    recentHead: recentlyPlayed.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
    })),
    currentSongMeta: input.currentSong
      ? {
          id: input.currentSong.id,
          title: input.currentSong.title,
          artist: input.currentSong.artist,
        }
      : null,
    recentlyPlayed,
    favorites,
    activeQueue,
  };
}

export function getPlayerFeedSnapshot(): PlayerFeedSnapshot {
  return snapshot;
}

export function setPlayerFeedSnapshot(next: PlayerFeedSnapshot) {
  if (snapshotsEqual(snapshot, next)) return;
  snapshot = next;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // feed listeners must never affect playback
    }
  });
}

export function subscribePlayerFeed(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePlayerFeedSnapshot(): PlayerFeedSnapshot {
  return useSyncExternalStore(
    subscribePlayerFeed,
    getPlayerFeedSnapshot,
    getPlayerFeedSnapshot
  );
}
