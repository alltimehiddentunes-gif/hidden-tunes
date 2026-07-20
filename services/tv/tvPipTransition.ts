/**
 * Pure TV automatic-PiP transition contract.
 * Keeps the native VideoView attached until PiP is active or failed.
 * Does not reference HiddenAudio / PlayerContext / Queue.
 */

export type TvPipTransitionState =
  | "idle"
  | "requesting"
  | "active"
  | "stopping"
  | "failed";

export type AppLifecycleState = "active" | "inactive" | "background" | string;

export type TvPipTransitionEvent =
  | { type: "app_lifecycle"; appState: AppLifecycleState }
  | { type: "route_blur" }
  | { type: "route_focus" }
  | { type: "auto_pip_eligible"; eligible: boolean }
  | { type: "pip_request_started" }
  | { type: "pip_active" }
  | { type: "pip_stopped" }
  | { type: "pip_failed" }
  | { type: "source_replaced" }
  | { type: "session_stopped" }
  | { type: "explicit_back" }
  | { type: "explicit_close" };

export type TvPipTransitionSnapshot = {
  state: TvPipTransitionState;
  appState: AppLifecycleState;
  routeFocused: boolean;
  presentationHoldFull: boolean;
  autoPipRequestCount: number;
  inFlight: boolean;
  nativeSurfaceMustStayMounted: boolean;
  allowRouteBlurAutoFloat: boolean;
};

export function createTvPipTransitionSnapshot(
  partial?: Partial<TvPipTransitionSnapshot>
): TvPipTransitionSnapshot {
  return {
    state: "idle",
    appState: "active",
    routeFocused: true,
    presentationHoldFull: false,
    autoPipRequestCount: 0,
    inFlight: false,
    nativeSurfaceMustStayMounted: true,
    allowRouteBlurAutoFloat: true,
    ...partial,
  };
}

/**
 * Route blur from app backgrounding must not be treated as Back.
 * Only auto-float when the app is still active (true in-app navigation).
 */
export function shouldAutoFloatOnRouteBlur(input: {
  appState: AppLifecycleState;
  pipTransitionState: TvPipTransitionState;
  sessionActive: boolean;
}): boolean {
  if (!input.sessionActive) return false;
  if (input.appState === "inactive" || input.appState === "background") {
    return false;
  }
  if (
    input.pipTransitionState === "requesting" ||
    input.pipTransitionState === "active"
  ) {
    return false;
  }
  return true;
}

export function shouldKeepFullPresentationForAutoPiP(input: {
  appState: AppLifecycleState;
  pipTransitionState: TvPipTransitionState;
  autoPipEligible: boolean;
  isPlaying: boolean;
}): boolean {
  if (!input.autoPipEligible || !input.isPlaying) return false;
  if (input.appState === "inactive" || input.appState === "background") {
    return true;
  }
  return (
    input.pipTransitionState === "requesting" ||
    input.pipTransitionState === "active"
  );
}

/**
 * Automatic PiP uses startsPictureInPictureAutomatically only.
 * Manual startPictureInPicture remains a separate explicit path.
 */
export function resolveAutomaticPipOwner(): "startsPictureInPictureAutomatically" {
  return "startsPictureInPictureAutomatically";
}

export function reduceTvPipTransition(
  snapshot: TvPipTransitionSnapshot,
  event: TvPipTransitionEvent
): TvPipTransitionSnapshot {
  switch (event.type) {
    case "app_lifecycle": {
      const appState = event.appState;
      const leaving =
        appState === "inactive" || appState === "background";
      const nextState =
        leaving && snapshot.state === "idle"
          ? ("requesting" as const)
          : snapshot.state === "requesting" && appState === "active"
            ? ("idle" as const)
            : snapshot.state;
      return {
        ...snapshot,
        appState,
        state: nextState,
        presentationHoldFull:
          leaving ||
          nextState === "requesting" ||
          nextState === "active",
        inFlight: nextState === "requesting" ? true : snapshot.inFlight,
        allowRouteBlurAutoFloat: !leaving && nextState === "idle",
        nativeSurfaceMustStayMounted: true,
        autoPipRequestCount:
          leaving && snapshot.state === "idle"
            ? snapshot.autoPipRequestCount + 1
            : snapshot.autoPipRequestCount,
      };
    }
    case "route_blur":
      return {
        ...snapshot,
        routeFocused: false,
        allowRouteBlurAutoFloat: shouldAutoFloatOnRouteBlur({
          appState: snapshot.appState,
          pipTransitionState: snapshot.state,
          sessionActive: true,
        }),
        nativeSurfaceMustStayMounted: true,
      };
    case "route_focus":
      return {
        ...snapshot,
        routeFocused: true,
        presentationHoldFull: false,
        allowRouteBlurAutoFloat: true,
        state: snapshot.state === "active" ? "active" : "idle",
        inFlight: false,
      };
    case "pip_request_started":
      if (snapshot.inFlight || snapshot.state === "active") {
        return snapshot;
      }
      return {
        ...snapshot,
        state: "requesting",
        inFlight: true,
        presentationHoldFull: true,
        allowRouteBlurAutoFloat: false,
        nativeSurfaceMustStayMounted: true,
        autoPipRequestCount: snapshot.autoPipRequestCount + 1,
      };
    case "pip_active":
      return {
        ...snapshot,
        state: "active",
        inFlight: false,
        presentationHoldFull: true,
        allowRouteBlurAutoFloat: false,
        nativeSurfaceMustStayMounted: true,
      };
    case "pip_stopped":
      return {
        ...snapshot,
        state: "idle",
        inFlight: false,
        presentationHoldFull: false,
        allowRouteBlurAutoFloat: true,
        nativeSurfaceMustStayMounted: true,
      };
    case "pip_failed":
      return {
        ...snapshot,
        state: "failed",
        inFlight: false,
        presentationHoldFull: false,
        allowRouteBlurAutoFloat: snapshot.appState === "active",
        nativeSurfaceMustStayMounted: true,
      };
    case "source_replaced":
    case "session_stopped":
      return createTvPipTransitionSnapshot({
        appState: snapshot.appState,
        routeFocused: snapshot.routeFocused,
      });
    case "explicit_back":
      return {
        ...snapshot,
        presentationHoldFull: false,
        allowRouteBlurAutoFloat: true,
        state: snapshot.state === "active" ? "active" : "idle",
        inFlight: false,
      };
    case "explicit_close":
      return createTvPipTransitionSnapshot({
        appState: snapshot.appState,
        routeFocused: false,
      });
    case "auto_pip_eligible":
      return snapshot;
    default:
      return snapshot;
  }
}

/**
 * inactive → background must not create a second automatic request.
 */
export function countAutomaticPipRequestsForLifecycle(sequence: AppLifecycleState[]): number {
  let count = 0;
  let snapshot = createTvPipTransitionSnapshot();
  for (const appState of sequence) {
    const before = snapshot.autoPipRequestCount;
    snapshot = reduceTvPipTransition(snapshot, {
      type: "app_lifecycle",
      appState,
    });
    if (snapshot.autoPipRequestCount > before) {
      count += 1;
    }
  }
  return count;
}
