/** Dev-only PlayerContext traces (startup, routing guards, preload). */
export function logPlayerContextDev(message: string, details?: unknown) {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return;

  if (details !== undefined) {
    console.log(message, details);
    return;
  }

  console.log(message);
}

/** Playback/storage failures — always emitted (no progress/tick spam). */
export function logPlayerContextError(message: string, error?: unknown) {
  console.warn(message, error);
}
