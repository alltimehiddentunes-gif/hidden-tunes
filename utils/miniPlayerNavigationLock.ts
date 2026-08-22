export type MiniPlayerNavigationLock = {
  tryAcquire: (destinationKey: string) => boolean;
  release: () => void;
  dispose: () => void;
  isLocked: () => boolean;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export function createMiniPlayerNavigationLock(
  timeoutMs = 1500,
  schedule: (callback: () => void, delay: number) => TimerHandle = setTimeout,
  cancel: (timer: TimerHandle) => void = clearTimeout,
): MiniPlayerNavigationLock {
  let active: { destinationKey: string; timer: TimerHandle } | null = null;

  const release = () => {
    if (!active) return;
    cancel(active.timer);
    active = null;
  };

  return {
    tryAcquire(destinationKey) {
      if (active) return false;
      const timer = schedule(() => {
        active = null;
      }, timeoutMs);
      active = { destinationKey, timer };
      return true;
    },
    release,
    dispose: release,
    isLocked: () => active !== null,
  };
}
