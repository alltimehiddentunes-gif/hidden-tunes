import {
  resolveHiddenTvControlsContract,
  shouldAutoHideTvFullscreenControls,
  TV_FULLSCREEN_CONTROLS_HIDE_MS,
} from "../services/tv/tvControlsAutoHideContract";

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
}

const playingFullscreen = {
  isUiFullscreen: true,
  isPlaying: true,
  isLoading: false,
  hasError: false,
  isFullscreenTransitioning: false,
};

assert(
  shouldAutoHideTvFullscreenControls(playingFullscreen),
  "playing fullscreen schedules auto-hide"
);
assert(
  !shouldAutoHideTvFullscreenControls({
    ...playingFullscreen,
    isUiFullscreen: false,
  }),
  "expanded portrait controls stay visible"
);
assert(
  !shouldAutoHideTvFullscreenControls({ ...playingFullscreen, isPlaying: false }),
  "paused controls stay visible"
);
assert(
  !shouldAutoHideTvFullscreenControls({ ...playingFullscreen, isLoading: true }),
  "buffering controls stay visible"
);
assert(
  !shouldAutoHideTvFullscreenControls({ ...playingFullscreen, hasError: true }),
  "error controls stay visible"
);
assert(
  !shouldAutoHideTvFullscreenControls({
    ...playingFullscreen,
    isFullscreenTransitioning: true,
  }),
  "orientation/fullscreen transition controls stay visible"
);
assert(TV_FULLSCREEN_CONTROLS_HIDE_MS === 3000, "three-second timeout");

const hidden = resolveHiddenTvControlsContract();
assert(hidden.opacity === 0, "hidden with opacity");
assert(hidden.pointerEvents === "none", "hidden chrome cannot intercept taps");
assert(!hidden.unmountsControls, "controls stay mounted");
assert(!hidden.unmountsVideo, "video stays mounted");

console.log("PASS: tv-controls-auto-hide-contract");
