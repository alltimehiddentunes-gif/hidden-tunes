/**
 * Playback always outranks Search derivation on the JS thread.
 * Non-critical Search merge/rank work yields while a tap is in flight.
 */

let playbackCriticalDepth = 0;

export function beginPlaybackCriticalSection() {
  playbackCriticalDepth += 1;
}

export function endPlaybackCriticalSection() {
  playbackCriticalDepth = Math.max(0, playbackCriticalDepth - 1);
}

export function isPlaybackCriticalSectionActive() {
  return playbackCriticalDepth > 0;
}

/** Yield to the event loop so playSong promise continuations can run first. */
export function yieldToPlaybackCriticalPath(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setTimeout === "function") {
      setTimeout(resolve, 0);
      return;
    }
    resolve();
  });
}

/**
 * Run Search work immediately unless a playback critical section is open.
 * When playback is active, wait one tick so native load is not starved.
 */
export async function runSearchWorkAfterPlaybackYield<T>(
  work: () => T | Promise<T>
): Promise<T> {
  if (isPlaybackCriticalSectionActive()) {
    await yieldToPlaybackCriticalPath();
  }
  return work();
}
