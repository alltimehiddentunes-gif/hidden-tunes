export type NowPlayingSnapshot = {
  currentSongId: string;
  isPlaying: boolean;
};

export type TrackPlaybackStatusSnapshot = {
  isActive: boolean;
  isPlaying: boolean;
};

let snapshot: NowPlayingSnapshot = {
  currentSongId: "",
  isPlaying: false,
};

const globalListeners = new Set<() => void>();
/** Track-id scoped listeners: only notified when that track's active/playing semantics change. */
const trackListeners = new Map<string, Set<() => void>>();
const trackStatusCache = new Map<string, TrackPlaybackStatusSnapshot>();

export function getNowPlayingSnapshot(): NowPlayingSnapshot {
  return snapshot;
}

/** Primitive selector for shell chrome that only cares whether a song exists. */
export function getNowPlayingSongIdSnapshot(): string {
  return snapshot.currentSongId;
}

export function getTrackPlaybackStatusSnapshot(
  trackId: string
): TrackPlaybackStatusSnapshot {
  const normalizedTrackId = String(trackId || "");
  const isActive =
    !!normalizedTrackId && snapshot.currentSongId === normalizedTrackId;
  const isPlaying = isActive && snapshot.isPlaying;
  const cached = trackStatusCache.get(normalizedTrackId);
  if (
    cached &&
    cached.isActive === isActive &&
    cached.isPlaying === isPlaying
  ) {
    return cached;
  }
  const next: TrackPlaybackStatusSnapshot = { isActive, isPlaying };
  if (normalizedTrackId) trackStatusCache.set(normalizedTrackId, next);
  return next;
}

function notifyTrack(trackId: string) {
  if (!trackId) return;
  const listeners = trackListeners.get(trackId);
  if (!listeners?.size) return;
  listeners.forEach((listener) => listener());
}

export function setNowPlayingSnapshot(next: NowPlayingSnapshot) {
  const currentSongId = String(next.currentSongId || "");
  const isPlaying = Boolean(next.isPlaying);
  const previous = snapshot;

  if (
    previous.currentSongId === currentSongId &&
    previous.isPlaying === isPlaying
  ) {
    return;
  }

  snapshot = { currentSongId, isPlaying };

  // Global listeners (song-id chrome, diagnostics) still see every change.
  globalListeners.forEach((listener) => listener());

  // Row listeners only wake when THEIR track's {isActive,isPlaying} flips.
  const previousActive = previous.currentSongId;
  const nextActive = currentSongId;
  if (previousActive && previousActive !== nextActive) {
    notifyTrack(previousActive);
  }
  if (nextActive) {
    notifyTrack(nextActive);
  }
}

export function subscribeNowPlaying(listener: () => void) {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

/**
 * Subscribe to one track's active/playing status only.
 * Inactive rows are not notified when some other track starts/stops.
 */
export function subscribeTrackPlaybackStatus(
  trackId: string,
  listener: () => void
) {
  const normalizedTrackId = String(trackId || "");
  if (!normalizedTrackId) {
    return () => {};
  }

  let listeners = trackListeners.get(normalizedTrackId);
  if (!listeners) {
    listeners = new Set();
    trackListeners.set(normalizedTrackId, listeners);
  }
  listeners.add(listener);

  return () => {
    const current = trackListeners.get(normalizedTrackId);
    if (!current) return;
    current.delete(listener);
    if (!current.size) trackListeners.delete(normalizedTrackId);
  };
}
