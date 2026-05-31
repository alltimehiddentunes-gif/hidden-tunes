import { FALLBACK_ARTWORK, getArtworkUri } from "./artwork";

type RemoteMediaSongLike = {
  id?: string | number;
  title?: string;
  artist?: string;
  album?: string;
  sourceName?: string;
  channelTitle?: string;
  user?: { name?: string };
  [key: string]: unknown;
};

export type RemoteMediaSessionSnapshotLike = {
  song: RemoteMediaSongLike | null;
  isPlaying: boolean;
  isLoading: boolean;
  positionMillis: number;
  durationMillis: number;
};

const artworkUriBySongId = new Map<string, string>();
let lastSyncedSongId = "";
let syncGeneration = 0;

export function resolveRemoteMediaArtworkUri(song: RemoteMediaSongLike | null) {
  if (!song) return FALLBACK_ARTWORK;
  return getArtworkUri(song);
}

/** Prevent stale metadata from replacing a known-good artwork URI. */
export function shouldApplyRemoteArtwork(
  songId: string,
  nextArtworkUri: string
) {
  const safeId = String(songId || "").trim();
  if (!safeId) return true;

  const previous = artworkUriBySongId.get(safeId);
  if (!previous) {
    artworkUriBySongId.set(safeId, nextArtworkUri);
    return true;
  }

  if (
    previous !== nextArtworkUri &&
    nextArtworkUri === FALLBACK_ARTWORK &&
    previous !== FALLBACK_ARTWORK
  ) {
    return false;
  }

  artworkUriBySongId.set(safeId, nextArtworkUri);
  return true;
}

export function resetRemoteMediaSessionLayer() {
  artworkUriBySongId.clear();
  lastSyncedSongId = "";
  syncGeneration = 0;
}

/**
 * Push artwork/metadata before playback state when the track changes,
 * and ignore stale sync passes that arrive out of order.
 */
export async function syncRemoteMediaSessionOrdered(
  snapshot: RemoteMediaSessionSnapshotLike,
  syncFn: (snapshot: RemoteMediaSessionSnapshotLike) => Promise<void>
) {
  const generation = ++syncGeneration;
  const songId = String(snapshot.song?.id ?? "");

  if (!snapshot.song) {
    lastSyncedSongId = "";
    await syncFn(snapshot);
    return;
  }

  const artworkUri = resolveRemoteMediaArtworkUri(snapshot.song);
  if (!shouldApplyRemoteArtwork(songId, artworkUri)) {
    return;
  }

  if (songId && songId !== lastSyncedSongId) {
    lastSyncedSongId = songId;

    await syncFn({
      ...snapshot,
      isPlaying: false,
      isLoading: true,
      positionMillis: 0,
    });

    if (generation !== syncGeneration) {
      return;
    }
  }

  await syncFn(snapshot);
}

export function getNotificationPlayerDeepLink() {
  return "hiddentunes://notification.click";
}
