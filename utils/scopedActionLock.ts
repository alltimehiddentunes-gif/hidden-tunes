export type ScopedActionLock = {
  tryAcquire: (identity?: string) => boolean;
  release: () => void;
  dispose: () => void;
  isLocked: () => boolean;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export function createScopedActionLock(
  timeoutMs = 1500,
  schedule: (callback: () => void, delay: number) => TimerHandle = setTimeout,
  cancel: (timer: TimerHandle) => void = clearTimeout,
): ScopedActionLock {
  let active: { identity: string; timer: TimerHandle } | null = null;

  const release = () => {
    if (!active) return;
    cancel(active.timer);
    active = null;
  };

  return {
    tryAcquire(identity = "action") {
      if (active) return false;
      const timer = schedule(() => {
        active = null;
      }, timeoutMs);
      active = { identity, timer };
      return true;
    },
    release,
    dispose: release,
    isLocked: () => active !== null,
  };
}
