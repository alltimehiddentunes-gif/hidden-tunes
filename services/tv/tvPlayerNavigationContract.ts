/**
 * Pure contracts for TV full-player route singleton and PiP restore.
 * Does not reference HiddenAudio / PlayerContext / Queue.
 */

export type TvPlayerOpenReason =
  | "user-open"
  | "floating-player-tap"
  | "pip-restore";

export type TvPlayerNavigationDecision = {
  setFullPresentation: boolean;
  navigate: boolean;
  navigationMode: "none" | "replace" | "push";
  reuseExistingRoute: boolean;
  rejectReason?:
    | "no-session"
    | "duplicate-restore"
    | "already-full-on-route"
    | "foreground-alone"
    | "pip-start"
    | "blank-route-forbidden";
};

export type TvPipRestoreIntentState =
  | "idle"
  | "requested"
  | "handling"
  | "completed"
  | "failed";

export function shouldOpenTvPlayerRoute(input: {
  reason: TvPlayerOpenReason;
  sessionActive: boolean;
  routeIsTvPlayer: boolean;
  presentationMode: "closed" | "floating" | "fullPlayer";
  restoreInFlight?: boolean;
}): TvPlayerNavigationDecision {
  if (!input.sessionActive) {
    return {
      setFullPresentation: false,
      navigate: false,
      navigationMode: "none",
      reuseExistingRoute: false,
      rejectReason: "no-session",
    };
  }

  if (input.reason === "pip-restore" && input.restoreInFlight) {
    return {
      setFullPresentation: true,
      navigate: false,
      navigationMode: "none",
      reuseExistingRoute: true,
      rejectReason: "duplicate-restore",
    };
  }

  // Already on the full-player route: never replace/push again (blank flash).
  if (input.routeIsTvPlayer) {
    return {
      setFullPresentation: true,
      navigate: false,
      navigationMode: "none",
      reuseExistingRoute: true,
      rejectReason:
        input.presentationMode === "fullPlayer"
          ? "already-full-on-route"
          : undefined,
    };
  }

  return {
    setFullPresentation: true,
    navigate: true,
    // replace avoids stacking duplicate /tv-player entries
    navigationMode: input.reason === "user-open" ? "push" : "replace",
    reuseExistingRoute: false,
  };
}

export function shouldForceFullPlayerOnAppForegroundAlone(): false {
  return false;
}

export function shouldNavigateOnPipStart(): false {
  return false;
}

export function shouldNavigateOnAppBackground(): false {
  return false;
}

export function isBlankTvPlayerRouteAllowed(): false {
  return false;
}

export function createPipRestoreIntentState(
  state: TvPipRestoreIntentState = "idle"
): { state: TvPipRestoreIntentState } {
  return { state };
}

export function reducePipRestoreIntent(
  current: TvPipRestoreIntentState,
  event:
    | "restore_requested"
    | "restore_handling"
    | "restore_completed"
    | "restore_failed"
    | "pip_started"
    | "session_stopped"
): TvPipRestoreIntentState {
  switch (event) {
    case "restore_requested":
      if (current === "requested" || current === "handling") return current;
      return "requested";
    case "restore_handling":
      return current === "requested" || current === "idle"
        ? "handling"
        : current;
    case "restore_completed":
      return "idle";
    case "restore_failed":
      return "idle";
    case "pip_started":
      return "idle";
    case "session_stopped":
      return "idle";
    default:
      return current;
  }
}

export function resolveBackVersusCloseRouteActions() {
  return {
    back: {
      removeFullRoute: true,
      preserveSession: true,
      presentationAfter: "floating" as const,
    },
    close: {
      removeFullRoute: true,
      preserveSession: false,
      presentationAfter: "closed" as const,
    },
  };
}
