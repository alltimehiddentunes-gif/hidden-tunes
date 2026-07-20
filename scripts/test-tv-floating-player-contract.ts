import { resolveFloatingTvPlayerContract } from "../services/tv/tvFloatingPlayerContract";

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
  const c = resolveFloatingTvPlayerContract();
  assert(c.videoFirstSurface, "1. video-first");
  assert(c.transparentOverlayControls, "2. transparent overlays");
  assertEqual(c.standalonePipButton, false, "3. no standalone PiP");
  assertEqual(c.opaqueTitleControlBands, false, "4. no opaque bands");
  assert(c.anchoredAboveBottomNav, "5. above bottom nav");
  assert(c.samePlayerSession, "6. same session");
  assert(c.expandReturnsPortraitFullPlayer, "7. expand → portrait full");
  assertEqual(c.expandDoesNotEnterLandscape, true, "8. expand not landscape");
  assert(c.landscapeOnlyFromExplicitFullscreen, "9. landscape only FS");
  assertEqual(c.referencesHiddenAudio, false, "10. no HiddenAudio");
  assertEqual(c.referencesPlayerContext, false, "11. no PlayerContext");
  console.log("PASS: tv-floating-player-contract");
}

main();
