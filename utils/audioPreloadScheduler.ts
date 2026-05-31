import { logAudioPreloadSkip } from "./audioPreloadTargeting";
import { shouldRunNonEssentialWork } from "./performanceMode";

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDebouncedAudioPreload(
  key: string,
  work: () => void | Promise<void>,
  options?: { delayMs?: number }
): () => void {
  const delayMs = Math.max(0, Number(options?.delayMs) || 450);
  const existing = debounceTimers.get(key);

  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    debounceTimers.delete(key);

    if (!shouldRunNonEssentialWork()) {
      logAudioPreloadSkip("scroll_or_background", { key });
      return;
    }

    void work();
  }, delayMs);

  debounceTimers.set(key, timer);

  return () => {
    const pending = debounceTimers.get(key);

    if (pending === timer) {
      clearTimeout(timer);
      debounceTimers.delete(key);
    }
  };
}
