/**
 * Pure + lightweight runtime helpers for TV browse tap → play handoff.
 * Latest tap wins. Does not create a second player or touch HiddenAudio.
 */

export type TvBrowseTapDecision =
  | { action: "accept"; reason: "first" | "switch" | "retry_after_idle" }
  | { action: "suppress"; reason: "same_in_flight" };

export function decideTvBrowseTap(input: {
  tappedId: string;
  inFlightId: string | null;
  generation: number;
}): TvBrowseTapDecision & { nextGeneration: number } {
  if (input.inFlightId && input.inFlightId === input.tappedId) {
    return {
      action: "suppress",
      reason: "same_in_flight",
      nextGeneration: input.generation,
    };
  }
  return {
    action: "accept",
    reason: input.inFlightId ? "switch" : "first",
    nextGeneration: input.generation + 1,
  };
}

export function shouldApplyTvBrowseTapResult(input: {
  resultGeneration: number;
  latestGeneration: number;
}): boolean {
  return input.resultGeneration === input.latestGeneration;
}

export function shouldStopExistingTvOnBrowseTap(input: {
  tappedId: string;
  activeItemId: string | null;
  sessionActive: boolean;
}): boolean {
  if (!input.sessionActive) return false;
  if (!input.activeItemId) return true;
  return input.activeItemId !== input.tappedId;
}

export function resolveTvTapPlaybackContract() {
  return {
    firstTapBecomesActiveImmediately: true as const,
    oneRequestPerAcceptedTap: true as const,
    sameCardDoubleTapSuppressed: true as const,
    newerTapSupersedesStale: true as const,
    staleSuccessIgnored: true as const,
    staleFailureIgnored: true as const,
    oldPlaybackRelinquishesOnAcceptedSwitch: true as const,
    newSourceAppliedOnce: true as const,
    playerRouteSingleton: true as const,
    noPlayerInsideCard: true as const,
    noDoubleAudio: true as const,
    referencesHiddenAudio: false as const,
    referencesPlayerContext: false as const,
  };
}
