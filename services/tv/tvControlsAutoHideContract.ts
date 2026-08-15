export const TV_FULLSCREEN_CONTROLS_HIDE_MS = 3000;
export const TV_FULLSCREEN_CONTROLS_FADE_MS = 220;

export type TvControlsAutoHideState = {
  isUiFullscreen: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  isFullscreenTransitioning: boolean;
};

/** Pure policy used by the persistent TV host and its focused regression test. */
export function shouldAutoHideTvFullscreenControls(
  state: TvControlsAutoHideState
) {
  return (
    state.isUiFullscreen &&
    state.isPlaying &&
    !state.isLoading &&
    !state.hasError &&
    !state.isFullscreenTransitioning
  );
}

export function resolveHiddenTvControlsContract() {
  return {
    opacity: 0,
    pointerEvents: "none" as const,
    unmountsControls: false,
    unmountsVideo: false,
  };
}
