/**
 * Pure contract for premium floating in-app TV window.
 * Landscape starts only from explicit Fullscreen, never from Expand.
 */

export function resolveFloatingTvPlayerContract() {
  return {
    videoFirstSurface: true as const,
    transparentOverlayControls: true as const,
    standalonePipButton: false as const,
    opaqueTitleControlBands: false as const,
    anchoredAboveBottomNav: true as const,
    samePlayerSession: true as const,
    noFlickerOnTabSwitch: true as const,
    expandReturnsPortraitFullPlayer: true as const,
    expandDoesNotEnterLandscape: true as const,
    landscapeOnlyFromExplicitFullscreen: true as const,
    referencesHiddenAudio: false as const,
    referencesPlayerContext: false as const,
  };
}
