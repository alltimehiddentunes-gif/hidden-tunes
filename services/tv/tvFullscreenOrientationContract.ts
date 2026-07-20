/**
 * Pure contracts for TV fullscreen orientation + geometry.
 * No HiddenAudio / PlayerContext / Queue references.
 */

export type TvLayoutOrientation = "portrait" | "landscape";

export function resolveLayoutOrientationFromWindow(
  width: number,
  height: number
): TvLayoutOrientation {
  return width > height ? "landscape" : "portrait";
}

export function shouldRequestLandscapeOnFullscreenEnter(input: {
  enteringFullscreen: boolean;
  alreadyRequestedForSession: boolean;
}): boolean {
  return input.enteringFullscreen && !input.alreadyRequestedForSession;
}

export function shouldRestorePortraitOnFullscreenExit(input: {
  exitingFullscreen: boolean;
  alreadyRestored: boolean;
}): boolean {
  return input.exitingFullscreen && !input.alreadyRestored;
}

export function resolveFullscreenGeometryPolicy(input: {
  isUiFullscreen: boolean;
  width: number;
  height: number;
}) {
  if (!input.isUiFullscreen) {
    return {
      mode: "portrait_bounded_16_9" as const,
      useAspectRatioStage: true,
      absoluteFillStage: false,
      portraitChromeVisible: true,
      layoutOrientation: resolveLayoutOrientationFromWindow(
        input.width,
        input.height
      ),
    };
  }

  const layoutOrientation = resolveLayoutOrientationFromWindow(
    input.width,
    input.height
  );

  return {
    mode:
      layoutOrientation === "landscape"
        ? ("landscape_edge_to_edge" as const)
        : ("portrait_fullscreen_edge_to_edge" as const),
    useAspectRatioStage: false,
    absoluteFillStage: true,
    portraitChromeVisible: false,
    layoutOrientation,
  };
}

export function resolveTvOrientationOwnerContract() {
  return {
    ownerModule: "services/tv/tvFullscreenOrientation.ts" as const,
    usesTransformFakeRotation: false as const,
    createsSecondPlayer: false as const,
    createsSecondVideoView: false as const,
    referencesHiddenAudio: false as const,
    referencesPlayerContext: false as const,
    portraitFirstOutsideFullscreen: true as const,
    landscapeScopedToTvFullscreen: true as const,
  };
}

export function resolveOrientationNativeRebuildContract(input: {
  packageInstalled: boolean;
  resolvedExpoOrientation: "portrait" | "default" | "landscape" | string;
  pluginPresent: boolean;
}) {
  // "default" allows device rotation; JS locks portrait-first outside TV FS.
  const configAllowsLandscape = input.resolvedExpoOrientation === "default";
  const configPrepared =
    input.packageInstalled && input.pluginPresent && configAllowsLandscape;

  return {
    packageInstalled: input.packageInstalled,
    pluginPresent: input.pluginPresent,
    configAllowsLandscape,
    configPrepared,
    resolvedExpoOrientation: input.resolvedExpoOrientation,
    /**
     * The installed iOS development binary was built with portrait-only masks
     * and without expo-screen-orientation. Metro cannot add that support.
     */
    requiresNewIosBuild: true as const,
    jsCanControlOrientationWithoutRebuild: false as const,
  };
}

export function resolvePipOrientationInteractionContract() {
  return {
    exitUiFullscreenOnPipStart: true as const,
    restorePortraitOnPipStart: true as const,
    orientationLoopForbidden: true as const,
    restoreDefaultState: "coherent_portrait_full_player" as const,
  };
}

/** Crash-proof contract: orientation is optional; UI fullscreen must not depend on it. */
export function resolveOrientationFailureFullscreenContract() {
  return {
    entersUiFullscreenRegardless: true as const,
    remainsUsableInPortrait: true as const,
    doesNotStopPlayback: true as const,
    doesNotAlterPip: true as const,
    doesNotRemountVideoView: true as const,
    doesNotThrow: true as const,
    cachesMissingModule: true as const,
    noRepeatedImportLoop: true as const,
    usesTransformFakeRotation: false as const,
  };
}

export function classifySimulatedExpoScreenOrientationMissingError(
  message: string
): "native-module-missing" | "request-failed" {
  if (/Cannot find native module ['"]?ExpoScreenOrientation['"]?/i.test(message)) {
    return "native-module-missing";
  }
  return "request-failed";
}

