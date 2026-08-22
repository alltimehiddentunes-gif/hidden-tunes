export type TvClosePhase =
  | "idle"
  | "navigating"
  | "fallback"
  | "destinationCommitted"
  | "destinationRendered"
  | "finalized";

export type TvCloseTransitionState = {
  phase: TvClosePhase;
  target: string | null;
};

export const IDLE_TV_CLOSE_TRANSITION: TvCloseTransitionState = {
  phase: "idle",
  target: null,
};

function routePath(value: string | null | undefined) {
  return String(value || "").trim().split("?")[0];
}

export function isTvCloseDestinationCommitted(
  pathname: string | null | undefined,
  target: string | null | undefined
) {
  const committedPath = routePath(pathname);
  const expectedPath = routePath(target);
  return Boolean(
    expectedPath &&
      committedPath === expectedPath &&
      committedPath !== "/tv-player"
  );
}

export function beginTvCloseTransition(
  state: TvCloseTransitionState,
  target: string
): TvCloseTransitionState {
  if (state.phase !== "idle") return state;
  return { phase: "navigating", target: routePath(target) || "/youtube-feed" };
}

export function observeTvClosePathname(
  state: TvCloseTransitionState,
  pathname: string
): TvCloseTransitionState {
  if (state.phase !== "navigating" && state.phase !== "fallback") return state;
  return isTvCloseDestinationCommitted(pathname, state.target)
    ? { ...state, phase: "destinationCommitted" }
    : state;
}

export function fallbackTvCloseTransition(
  state: TvCloseTransitionState,
  fallbackTarget = "/youtube-feed"
): TvCloseTransitionState {
  if (state.phase !== "navigating") return state;
  return { phase: "fallback", target: routePath(fallbackTarget) || "/youtube-feed" };
}

export function markTvCloseDestinationRendered(
  state: TvCloseTransitionState
): TvCloseTransitionState {
  return state.phase === "destinationCommitted"
    ? { ...state, phase: "destinationRendered" }
    : state;
}

export function finalizeTvCloseTransition(
  state: TvCloseTransitionState
): TvCloseTransitionState {
  return state.phase === "destinationRendered"
    ? { ...state, phase: "finalized" }
    : state;
}
