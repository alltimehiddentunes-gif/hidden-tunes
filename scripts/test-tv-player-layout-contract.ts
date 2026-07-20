import {
  assertExclusiveTvSurfaces,
  isBottomFloatingTvPlayerMode,
  isExpandedTvPlayerMode,
  resolveExpandedTvVideoLayoutPolicy,
  resolveTvBackVersusCloseActions,
  resolveTvPipWiringContract,
} from "../services/tv/tvPlayerLayoutContract";

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`FAIL: ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function main() {
  assert(isExpandedTvPlayerMode("fullPlayer"), "1. fullPlayer is expanded");
  assert(
    !isBottomFloatingTvPlayerMode("fullPlayer"),
    "1b. fullPlayer is not floating"
  );
  assert(isBottomFloatingTvPlayerMode("floating"), "1c. floating is floating");

  const actions = resolveTvBackVersusCloseActions();
  assert(actions.distinct, "2. Back and Close are distinct");
  assertEqual(actions.back, "leave_expanded_preserve_session", "2b. Back action");
  assertEqual(actions.close, "stop_or_clear_tv_session", "2c. Close action");

  assertEqual(actions.backClearsSession, false, "3. Back preserves session");

  assertEqual(
    assertExclusiveTvSurfaces({ nativeMounted: true, webViewMounted: false }),
    "exclusive",
    "4. native alone exclusive"
  );
  assertEqual(
    assertExclusiveTvSurfaces({ nativeMounted: false, webViewMounted: true }),
    "exclusive",
    "4b. webview alone exclusive"
  );
  assertEqual(
    assertExclusiveTvSurfaces({ nativeMounted: true, webViewMounted: true }),
    "conflict",
    "4c. both mounted is conflict"
  );

  const pip = resolveTvPipWiringContract();
  assertEqual(pip.manualStartMethod, "startPictureInPicture", "5. manual PiP");
  assertEqual(
    pip.automaticProp,
    "startsPictureInPictureAutomatically",
    "5b. automatic PiP"
  );
  assert(pip.samePlayerOwner, "5c. same player owner");

  const layout = resolveExpandedTvVideoLayoutPolicy();
  assertEqual(layout.fakePipSideArrow, false, "6. no fake PiP side arrow");
  assertEqual(layout.standalonePipFooter, false, "6b. no standalone PiP footer");
  assertEqual(
    layout.integratedPipInTransportRow,
    true,
    "6c. PiP integrated in transport"
  );

  assertEqual(
    layout.usesFixedDeviceScreenDimensions,
    false,
    "7. no fixed device dimensions"
  );
  assertEqual(
    layout.usesFixedSixteenByNineBand,
    true,
    "7b. portrait uses bounded 16:9"
  );
  assertEqual(layout.usesFlexFillVideoStage, false, "7c. no flex-fill stage");
  assertEqual(
    layout.heightMode,
    "bounded_sixteen_by_nine",
    "7d. bounded height mode"
  );
  assertEqual(layout.contentFit, "contain", "7e. contain contentFit");

  assert(
    typeof resolveTvBackVersusCloseActions === "function" &&
      typeof resolveExpandedTvVideoLayoutPolicy === "function",
    "8. layout contract stays isolated from HiddenAudio/PlayerContext/Queue"
  );

  console.log("TV player layout contract tests passed.");
}

main();
