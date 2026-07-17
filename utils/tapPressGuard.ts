export type TapGuardState = {
  key: string;
  at: number;
};

export function createTapGuardState(): TapGuardState {
  return { key: "", at: 0 };
}

/** Returns true when the tap should be ignored (duplicate within guardMs). */
export function shouldIgnoreDuplicateTap(
  state: TapGuardState,
  tapKey: string,
  guardMs = 450
): boolean {
  const now = Date.now();
  if (state.key === tapKey && now - state.at < guardMs) {
    return true;
  }

  state.key = tapKey;
  state.at = now;
  return false;
}
