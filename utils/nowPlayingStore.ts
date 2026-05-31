export type NowPlayingSnapshot = {
  currentSongId: string;
  isPlaying: boolean;
};

let snapshot: NowPlayingSnapshot = {
  currentSongId: "",
  isPlaying: false,
};

const listeners = new Set<() => void>();

export function getNowPlayingSnapshot(): NowPlayingSnapshot {
  return snapshot;
}

export function setNowPlayingSnapshot(next: NowPlayingSnapshot) {
  const currentSongId = String(next.currentSongId || "");
  const isPlaying = Boolean(next.isPlaying);

  if (
    snapshot.currentSongId === currentSongId &&
    snapshot.isPlaying === isPlaying
  ) {
    return;
  }

  snapshot = { currentSongId, isPlaying };
  listeners.forEach((listener) => listener());
}

export function subscribeNowPlaying(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
