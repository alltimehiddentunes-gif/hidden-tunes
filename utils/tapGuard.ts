/**
 * Lightweight in-memory tap guard (Phase 11).
 * Prevents double-taps from stacking async playback work.
 */
export function createTapGuard(minIntervalMs = 420) {
  let lastAt = 0;
  let lastKey = "";

  return (key = "default") => {
    const now = Date.now();
    if (key === lastKey && now - lastAt < minIntervalMs) {
      return false;
    }
    lastKey = key;
    lastAt = now;
    return true;
  };
}

export function createKeyedTapGuard(minIntervalMs = 420) {
  const lastByKey = new Map<string, number>();

  return (key: string) => {
    const now = Date.now();
    const previous = lastByKey.get(key) || 0;
    if (now - previous < minIntervalMs) {
      return false;
    }
    lastByKey.set(key, now);
    return true;
  };
}
