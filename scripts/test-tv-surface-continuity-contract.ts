import { resolveTvSurfaceContinuityContract } from "../services/tv/tvSurfaceContinuityContract";

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
  const c = resolveTvSurfaceContinuityContract();
  assertEqual(c.presentationChangeRecreatesPlayer, false, "1. no recreate");
  assertEqual(c.sourceResetOnPresentationChange, false, "2. no source reset");
  assertEqual(c.temporaryNullSource, false, "3. no null source");
  assertEqual(c.firstFrameResetOnOrientation, false, "4. no first-frame reset");
  assertEqual(c.placeholderFlash, false, "5. no placeholder flash");
  assertEqual(c.blackFlash, false, "6. no black flash");
  assertEqual(c.duplicateAudio, false, "7. no duplicate audio");
  assertEqual(c.keyBasedOnPresentationOrOrientation, false, "8. no FS/orient key");
  assertEqual(c.orientationChangeRemountsVideoView, false, "9. no remount on rotate");
  assertEqual(c.keyOwner, "playerGeneration", "10. generation key");
  assert(c.samePlayerSurvivesOrientation, "11. same player on orient");
  assert(c.samePlayerSurvivesFullscreenToggle, "12. same player on FS");
  assertEqual(c.referencesHiddenAudio, false, "13. no HiddenAudio");
  assertEqual(c.referencesPlayerContext, false, "14. no PlayerContext");
  console.log("PASS: tv-surface-continuity-contract");
}

main();
