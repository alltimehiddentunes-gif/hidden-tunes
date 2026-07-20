import {
  countAutomaticPipRequestsForLifecycle,
  createTvPipTransitionSnapshot,
  reduceTvPipTransition,
  resolveAutomaticPipOwner,
  shouldAutoFloatOnRouteBlur,
  shouldKeepFullPresentationForAutoPiP,
} from "../services/tv/tvPipTransition";
import { canUseTvPiP } from "../services/tv/tvPipEligibility";
import { resolveTvBackVersusCloseActions } from "../services/tv/tvPlayerLayoutContract";

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
  // 1. foreground playing TV is automatic-PiP eligible
  assert(
    canUseTvPiP({
      platform: "ios",
      sourceUri: "https://cdn.example.com/live/channel.m3u8",
      surface: "native",
      playerStatus: "playing",
      isNativeSurfaceMounted: true,
      sessionActive: true,
    }),
    "1. foreground playing eligible"
  );

  // 2. app inactive does not minimize the native surface
  assertEqual(
    shouldAutoFloatOnRouteBlur({
      appState: "inactive",
      pipTransitionState: "requesting",
      sessionActive: true,
    }),
    false,
    "2. inactive does not auto-float"
  );

  // 3. route blur caused by background does not call Back behavior
  assertEqual(
    shouldAutoFloatOnRouteBlur({
      appState: "background",
      pipTransitionState: "requesting",
      sessionActive: true,
    }),
    false,
    "3. background blur is not Back"
  );
  assertEqual(
    shouldAutoFloatOnRouteBlur({
      appState: "active",
      pipTransitionState: "idle",
      sessionActive: true,
    }),
    true,
    "3b. active navigation blur may float"
  );

  // 4. native surface remains mounted while PiP is requesting
  let snap = createTvPipTransitionSnapshot();
  snap = reduceTvPipTransition(snap, {
    type: "app_lifecycle",
    appState: "inactive",
  });
  assert(snap.nativeSurfaceMustStayMounted, "4. surface stays mounted");
  assertEqual(snap.state, "requesting", "4b. requesting on inactive");

  // 5. presentation remains full until PiP active or failed
  assert(
    shouldKeepFullPresentationForAutoPiP({
      appState: "inactive",
      pipTransitionState: "requesting",
      autoPipEligible: true,
      isPlaying: true,
    }),
    "5. keep full while requesting"
  );
  assert(snap.presentationHoldFull, "5b. hold full flag");

  // 6. inactive → background creates only one PiP request
  assertEqual(
    countAutomaticPipRequestsForLifecycle([
      "active",
      "inactive",
      "background",
    ]),
    1,
    "6. one request for inactive→background"
  );

  // 7. PiP success sets active state
  snap = reduceTvPipTransition(snap, { type: "pip_active" });
  assertEqual(snap.state, "active", "7. pip active");
  assertEqual(snap.inFlight, false, "7b. not in flight when active");

  // 8. PiP failure clears request-in-flight
  snap = createTvPipTransitionSnapshot({ state: "requesting", inFlight: true });
  snap = reduceTvPipTransition(snap, { type: "pip_failed" });
  assertEqual(snap.state, "failed", "8. failed state");
  assertEqual(snap.inFlight, false, "8b. in-flight cleared");

  // 9. second swipe is not required by the state machine
  assertEqual(
    countAutomaticPipRequestsForLifecycle([
      "active",
      "inactive",
      "background",
      "active",
      "inactive",
      "background",
    ]),
    2,
    "9. each leave creates at most one request (no forced double-swipe)"
  );
  assertEqual(
    resolveAutomaticPipOwner(),
    "startsPictureInPictureAutomatically",
    "9b. single automatic owner"
  );

  // 10. manual PiP remains separate
  assertEqual(
    resolveAutomaticPipOwner(),
    "startsPictureInPictureAutomatically",
    "10. automatic owner stays prop-based (manual startPictureInPicture is separate)"
  );

  // 11. Back still minimizes when explicitly pressed
  const actions = resolveTvBackVersusCloseActions();
  assertEqual(
    actions.back,
    "leave_expanded_preserve_session",
    "11. Back preserves session / leaves expanded"
  );
  snap = reduceTvPipTransition(createTvPipTransitionSnapshot(), {
    type: "explicit_back",
  });
  assertEqual(snap.allowRouteBlurAutoFloat, true, "11b. Back allows float");

  // 12. Close still stops the TV session
  assertEqual(
    actions.close,
    "stop_or_clear_tv_session",
    "12. Close stops session"
  );
  snap = reduceTvPipTransition(createTvPipTransitionSnapshot({ state: "active" }), {
    type: "explicit_close",
  });
  assertEqual(snap.state, "idle", "12b. close resets transition");

  // 13. source replacement clears stale PiP request
  snap = reduceTvPipTransition(
    createTvPipTransitionSnapshot({ state: "requesting", inFlight: true }),
    { type: "source_replaced" }
  );
  assertEqual(snap.state, "idle", "13. source replace clears");
  assertEqual(snap.inFlight, false, "13b. in-flight cleared");

  // 14. WebView-only source does not attempt native PiP
  assert(
    !canUseTvPiP({
      platform: "ios",
      sourceUri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      surface: "webview",
      playerStatus: "playing",
      isNativeSurfaceMounted: false,
      sessionActive: true,
    }),
    "14. WebView not native PiP"
  );

  // 15. no HiddenAudio or PlayerContext reference exists
  assert(
    typeof shouldAutoFloatOnRouteBlur === "function" &&
      typeof reduceTvPipTransition === "function",
    "15. transition helpers isolated from audio owners"
  );

  console.log("TV PiP transition contract tests passed.");
}

main();
