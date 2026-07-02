import { isBrowsingUnderLoad } from "./performanceMode";

export type PlaybackProgressSnapshot = {
  positionMillis: number;
  durationMillis: number;
};

let snapshot: PlaybackProgressSnapshot = {
  positionMillis: 0,
  durationMillis: 0,
};

const listeners = new Set<() => void>();
let lastListenerNotifyAt = 0;
const BROWSE_PROGRESS_NOTIFY_MS = 2000;

export function getPlaybackProgressSnapshot(): PlaybackProgressSnapshot {
  return snapshot;
}

export function setPlaybackProgressSnapshot(
  next: Partial<PlaybackProgressSnapshot>
) {
  const positionMillis = Math.max(
    0,
    Math.floor(next.positionMillis ?? snapshot.positionMillis)
  );
  const durationMillis = Math.max(
    0,
    Math.floor(next.durationMillis ?? snapshot.durationMillis)
  );

  if (
    snapshot.positionMillis === positionMillis &&
    snapshot.durationMillis === durationMillis
  ) {
    return;
  }

  const previousDuration = snapshot.durationMillis;
  const durationChanged =
    next.durationMillis !== undefined && durationMillis !== previousDuration;

  snapshot = { positionMillis, durationMillis };

  if (isBrowsingUnderLoad() && !durationChanged) {
    const now = Date.now();
    if (now - lastListenerNotifyAt < BROWSE_PROGRESS_NOTIFY_MS) {
      return;
    }
    lastListenerNotifyAt = now;
  } else {
    lastListenerNotifyAt = Date.now();
  }

  listeners.forEach((listener) => listener());
}

export function subscribePlaybackProgress(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
