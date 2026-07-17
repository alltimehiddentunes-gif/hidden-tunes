/**
 * Isolated TV media handoff tokens.
 * Prevents stale async TV resolver results from overriding a newer user action.
 * Does not own playback engines — callers use existing public stop/open APIs.
 */

let currentTransitionId = 0;
let activeAbort: AbortController | null = null;

export type TvMediaTransition = {
  transitionId: number;
  signal: AbortSignal;
};

export function beginTvMediaTransition(): TvMediaTransition {
  currentTransitionId += 1;

  try {
    activeAbort?.abort();
  } catch {
    // Ignore abort failures from a prior controller.
  }

  activeAbort = new AbortController();

  return {
    transitionId: currentTransitionId,
    signal: activeAbort.signal,
  };
}

export function isCurrentTvMediaTransition(transitionId: number) {
  return transitionId === currentTransitionId;
}

export function getCurrentTvMediaTransitionId() {
  return currentTransitionId;
}

/** Invalidate pending TV opens (e.g. user selected audio instead). */
export function invalidateTvMediaTransitions() {
  currentTransitionId += 1;

  try {
    activeAbort?.abort();
  } catch {
    // Ignore.
  }

  activeAbort = null;
}

export function isTvMediaHandoffAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: string }).name || "");
  return name === "AbortError";
}

/**
 * Audio → TV handoff helper around existing public stopPlayback + resolve/open.
 */
export async function runAudioToTvHandoff<T>(options: {
  stopPlayback?: () => Promise<void>;
  run: (transition: TvMediaTransition) => Promise<T>;
}): Promise<{ ok: true; value: T } | { ok: false; stale: true } | { ok: false; error: unknown }> {
  const transition = beginTvMediaTransition();

  try {
    await options.stopPlayback?.();
  } catch {
    // Music playback owns its own failure handling.
  }

  if (!isCurrentTvMediaTransition(transition.transitionId)) {
    return { ok: false, stale: true };
  }

  try {
    const value = await options.run(transition);

    if (!isCurrentTvMediaTransition(transition.transitionId)) {
      return { ok: false, stale: true };
    }

    return { ok: true, value };
  } catch (error) {
    if (
      isTvMediaHandoffAbortError(error) ||
      !isCurrentTvMediaTransition(transition.transitionId)
    ) {
      return { ok: false, stale: true };
    }

    return { ok: false, error };
  }
}
