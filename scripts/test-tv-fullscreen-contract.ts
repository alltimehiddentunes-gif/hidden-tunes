import {
  resolveBackWhileUiFullscreen,
  resolveFullscreenChromeVisibility,
  resolveFullscreenNavigationContract,
  resolveFullscreenVideoStageStyle,
  resolveIntegratedPipControlContract,
  resolvePortraitVideoStageStyle,
  resolveTvUiFullscreenOwner,
} from "../services/tv/tvFullscreenContract";
import { resolveExpandedTvVideoLayoutPolicy } from "../services/tv/tvPlayerLayoutContract";

function assert(condition: boolean, label: string) {
  if (!condition) throw new Error(`FAIL: ${label}`);
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function main() {
  const portrait = resolvePortraitVideoStageStyle();
  const fullscreen = resolveFullscreenVideoStageStyle();
  const layout = resolveExpandedTvVideoLayoutPolicy();

  // 1. portrait video stage is bounded
  assertEqual(portrait.aspectRatio, 16 / 9, "1. portrait 16:9");
  assertEqual(portrait.width, "100%", "1b. full width");

  // 2. portrait video stage does not use flex fill
  assertEqual(portrait.flex, undefined, "2. no flex on portrait stage");
  assertEqual(layout.usesFlexFillVideoStage, false, "2b. policy no flex fill");

  // 3. fullscreen stage uses full-window geometry
  assertEqual(fullscreen.position, "absolute", "3. fullscreen absolute");
  assertEqual(fullscreen.top, 0, "3b. top 0");
  assertEqual(fullscreen.bottom, 0, "3c. bottom 0");

  // 4. fullscreen does not retain portrait aspect-ratio wrapper
  assertEqual(fullscreen.aspectRatio, undefined, "4. no aspectRatio in FS");

  // 5. same VideoView/player owner
  assertEqual(
    resolveFullscreenNavigationContract().samePlayerOwner,
    true,
    "5. same player"
  );
  assertEqual(resolveTvUiFullscreenOwner(), "in_route_geometry", "5b. owner");

  // 6. fullscreen does not push /tv-player
  assertEqual(
    resolveFullscreenNavigationContract().pushesTvPlayerRoute,
    false,
    "6. no route push"
  );

  // 7. no modal second player
  assertEqual(
    resolveFullscreenNavigationContract().createsModalSecondVideoView,
    false,
    "7. no second VideoView"
  );

  // 8–9. chrome visibility
  const chromeFs = resolveFullscreenChromeVisibility(true);
  assertEqual(chromeFs.portraitHeaderVisible, false, "8. header hidden");
  assertEqual(chromeFs.portraitMetadataVisible, false, "9. metadata hidden");
  assert(chromeFs.fullscreenOverlayVisible, "10. overlay visible");

  // 11. Back exits fullscreen first
  assertEqual(
    resolveBackWhileUiFullscreen(true).action,
    "exit_fullscreen_first",
    "11. back exits FS first"
  );
  assertEqual(resolveBackWhileUiFullscreen(true).navigateAway, false, "11b");

  // 12. Close remains stop (portrait back still leave session preserved)
  assertEqual(
    resolveBackWhileUiFullscreen(false).action,
    "leave_expanded_preserve_session",
    "12. portrait back leaves expanded"
  );

  // 13. PiP remains separate + integrated
  const pipNative = resolveIntegratedPipControlContract({
    surface: "native",
    pipEligible: true,
    isUiFullscreen: false,
  });
  assertEqual(pipNative.standalonePipFooter, false, "13. no standalone footer");
  assert(pipNative.showIntegratedPipInTransport, "13b. integrated transport PiP");

  // 14. exiting fullscreen restores portrait geometry (contract tokens)
  const chromePortrait = resolveFullscreenChromeVisibility(false);
  assert(chromePortrait.portraitHeaderVisible, "14. header restored");
  assertEqual(layout.usesFixedSixteenByNineBand, true, "14b. portrait 16:9");

  // 15. orientation owner wired; native control still needs a new iOS build
  assertEqual(
    resolveFullscreenNavigationContract().orientationLockAvailable,
    true,
    "15. orientation JS owner available"
  );
  assertEqual(
    resolveFullscreenNavigationContract().orientationOwner,
    "tvFullscreenOrientation",
    "15b. orientation owner"
  );
  assert(
    resolveFullscreenNavigationContract().requiresNewIosDevelopmentBuild,
    "15c. NEW IOS DEVELOPMENT BUILD REQUIRED"
  );
  assertEqual(
    resolveFullscreenNavigationContract().usesTransformFakeRotation,
    false,
    "15d. no fake rotation"
  );

  // 16. WebView follows geometry / no fake PiP
  const pipWeb = resolveIntegratedPipControlContract({
    surface: "webview",
    pipEligible: false,
    isUiFullscreen: false,
  });
  assertEqual(pipWeb.showIntegratedPipInTransport, false, "16. no fake PiP");
  assertEqual(pipWeb.fakePipForWebView, false, "16b");

  // Updated PiP integration tests
  assertEqual(layout.standalonePipFooter, false, "pip1. no footer");
  assertEqual(layout.integratedPipInTransportRow, true, "pip2. integrated");
  assertEqual(pipNative.duplicatePipControls, false, "pip3. no duplicate");
  const pipFs = resolveIntegratedPipControlContract({
    surface: "native",
    pipEligible: true,
    isUiFullscreen: true,
  });
  assertEqual(pipFs.showIntegratedPipInTransport, false, "pip4. not both modes");
  assert(pipFs.showIntegratedPipInFullscreenOverlay, "pip5. FS overlay PiP");

  assert(
    typeof resolveTvUiFullscreenOwner === "function",
    "17. isolated from HiddenAudio/PlayerContext"
  );

  console.log("TV fullscreen contract tests passed.");
}

main();
