/**
 * Pure contract: presentation/orientation changes must not remount or reset TV playback.
 */

export function resolveTvSurfaceContinuityContract() {
  return {
    presentationChangeRecreatesPlayer: false as const,
    sourceResetOnPresentationChange: false as const,
    temporaryNullSource: false as const,
    firstFrameResetOnOrientation: false as const,
    placeholderFlash: false as const,
    blackFlash: false as const,
    duplicateAudio: false as const,
    keyBasedOnPresentationOrOrientation: false as const,
    orientationChangeRemountsVideoView: false as const,
    keyOwner: "playerGeneration" as const,
    samePlayerSurvivesOrientation: true as const,
    samePlayerSurvivesFullscreenToggle: true as const,
    referencesHiddenAudio: false as const,
    referencesPlayerContext: false as const,
  };
}
