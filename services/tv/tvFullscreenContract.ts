/**
 * Pure contracts for in-route TV UI fullscreen (same VideoView/player owner).
 * Does not reference HiddenAudio / PlayerContext / Queue.
 * Orientation locking is owned by services/tv/tvFullscreenOrientation.ts.
 * Native landscape requires a new iOS development build (config + module).
 */

export type TvUiFullscreenOwner = "in_route_geometry";

export function resolveTvUiFullscreenOwner(): TvUiFullscreenOwner {
  return "in_route_geometry";
}

export function resolvePortraitVideoStageStyle() {
  return {
    width: "100%" as const,
    aspectRatio: 16 / 9,
    position: "relative" as const,
    overflow: "hidden" as const,
    backgroundColor: "#000",
    flex: undefined,
  };
}

export function resolveFullscreenVideoStageStyle() {
  return {
    ...({ position: "absolute" as const, left: 0, right: 0, top: 0, bottom: 0 }),
    backgroundColor: "#000",
    aspectRatio: undefined,
    flex: undefined,
  };
}

/** Fullscreen stage follows current window size (portrait or landscape). */
export function resolveFullscreenStageFollowsWindowDimensions() {
  return {
    followsWindowDimensions: true as const,
    landscapeFillsViewport: true as const,
    portraitAspectRatioAppliedInFullscreen: false as const,
    portraitChromeHiddenInBothOrientations: true as const,
    controlsRespectLandscapeSafeAreas: true as const,
  };
}

export function resolveFullscreenChromeVisibility(isUiFullscreen: boolean) {
  return {
    portraitHeaderVisible: !isUiFullscreen,
    portraitTransportVisible: !isUiFullscreen,
    portraitMetadataVisible: !isUiFullscreen,
    standalonePipFooterVisible: false as const,
    fullscreenOverlayVisible: isUiFullscreen,
  };
}

export function resolveBackWhileUiFullscreen(isUiFullscreen: boolean) {
  if (isUiFullscreen) {
    return {
      action: "exit_fullscreen_first" as const,
      navigateAway: false,
      stopSession: false,
      minimize: false,
      restorePortrait: true as const,
    };
  }
  return {
    action: "leave_expanded_preserve_session" as const,
    navigateAway: true,
    stopSession: false,
    minimize: true,
    restorePortrait: false as const,
  };
}

export function resolveFullscreenNavigationContract() {
  return {
    pushesTvPlayerRoute: false as const,
    createsSecondPlayer: false as const,
    createsModalSecondVideoView: false as const,
    samePlayerOwner: true as const,
    contentFit: "contain" as const,
    /** JS orientation owner is wired; native control needs a new iOS build. */
    orientationLockAvailable: true as const,
    orientationOwner: "tvFullscreenOrientation" as const,
    requiresNewIosDevelopmentBuild: true as const,
    usesTransformFakeRotation: false as const,
  };
}

export function resolveIntegratedPipControlContract(input: {
  surface: "native" | "webview";
  pipEligible: boolean;
  isUiFullscreen: boolean;
}) {
  const showIntegrated =
    input.surface === "native" && input.pipEligible;
  return {
    standalonePipFooter: false as const,
    showIntegratedPipInTransport: showIntegrated && !input.isUiFullscreen,
    showIntegratedPipInFullscreenOverlay: showIntegrated && input.isUiFullscreen,
    duplicatePipControls: false as const,
    fakePipForWebView: false as const,
  };
}
