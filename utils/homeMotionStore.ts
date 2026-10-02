import { useSyncExternalStore } from "react";

/**
 * Home scroll motion gate — shared store so pausing ambient/hero motion during
 * vertical scroll does NOT re-render the entire MusicFeedScreen tree.
 */
let paused = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getHomeMotionPausedSnapshot() {
  return paused;
}

export function setHomeMotionPaused(next: boolean) {
  const value = !!next;
  if (paused === value) return;
  paused = value;
  emit();
}

export function subscribeHomeMotionPaused(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHomeMotionPaused() {
  return useSyncExternalStore(
    subscribeHomeMotionPaused,
    getHomeMotionPausedSnapshot,
    getHomeMotionPausedSnapshot
  );
}
