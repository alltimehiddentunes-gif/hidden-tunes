const APP_LAUNCHED_AT = Date.now();

export const FIRST_INTERACTION_WINDOW_MS = 5000;

export function isWithinFirstInteractionWindow() {
  return Date.now() - APP_LAUNCHED_AT < FIRST_INTERACTION_WINDOW_MS;
}

export function logBackgroundWork(event: string) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  console.log(`[background-work] ${event}`);
}

export function scheduleDelayedNonEssentialWork(
  work: () => void | Promise<void>,
  options?: {
    delayMs?: number;
    minDelayFromLaunchMs?: number;
  }
): () => void {
  const extraDelayMs = Math.max(0, Number(options?.delayMs) || 0);
  const minDelayFromLaunchMs =
    Number(options?.minDelayFromLaunchMs) || FIRST_INTERACTION_WINDOW_MS;
  const waitMs =
    Math.max(0, minDelayFromLaunchMs - (Date.now() - APP_LAUNCHED_AT)) + extraDelayMs;

  let cancelled = false;
  let frameId: number | null = null;

  const timer = setTimeout(() => {
    if (cancelled) return;

    const run = () => {
      if (cancelled) return;
      void work();
    };

    if (typeof requestAnimationFrame === "function") {
      frameId = requestAnimationFrame(run);
    } else {
      run();
    }
  }, waitMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (frameId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameId);
    }
  };
}
