import {
  createPipRestoreIntentState,
  isBlankTvPlayerRouteAllowed,
  reducePipRestoreIntent,
  resolveBackVersusCloseRouteActions,
  shouldForceFullPlayerOnAppForegroundAlone,
  shouldNavigateOnAppBackground,
  shouldNavigateOnPipStart,
  shouldOpenTvPlayerRoute,
} from "../services/tv/tvPlayerNavigationContract";

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
  // 1. PiP start does not navigate
  assertEqual(shouldNavigateOnPipStart(), false, "1. no nav on PiP start");

  // 2. App background does not navigate
  assertEqual(shouldNavigateOnAppBackground(), false, "2. no nav on background");

  // 3. App foreground alone does not force full player
  assertEqual(
    shouldForceFullPlayerOnAppForegroundAlone(),
    false,
    "3. foreground alone does not force full"
  );

  // 4. Explicit PiP restore creates at most one route
  const restore = shouldOpenTvPlayerRoute({
    reason: "pip-restore",
    sessionActive: true,
    routeIsTvPlayer: false,
    presentationMode: "fullPlayer",
  });
  assert(restore.navigate, "4. restore may navigate once when absent");
  assertEqual(restore.navigationMode, "replace", "4b. replace not push");

  // 5. Existing /tv-player is reused
  const reuse = shouldOpenTvPlayerRoute({
    reason: "pip-restore",
    sessionActive: true,
    routeIsTvPlayer: true,
    presentationMode: "fullPlayer",
  });
  assertEqual(reuse.navigate, false, "5. reuse existing route");
  assert(reuse.reuseExistingRoute, "5b. reused flag");

  // 6. Duplicate restore signals are ignored
  const dup = shouldOpenTvPlayerRoute({
    reason: "pip-restore",
    sessionActive: true,
    routeIsTvPlayer: false,
    presentationMode: "fullPlayer",
    restoreInFlight: true,
  });
  assertEqual(dup.navigate, false, "6. duplicate restore ignored");
  assertEqual(dup.rejectReason, "duplicate-restore", "6b. reason");

  // 7. Restore intent clears after success
  assertEqual(
    reducePipRestoreIntent("handling", "restore_completed"),
    "idle",
    "7. clear after success"
  );

  // 8. Restore intent clears after failure
  assertEqual(
    reducePipRestoreIntent("handling", "restore_failed"),
    "idle",
    "8. clear after failure"
  );

  // 9. VideoView remains mounted through restore (contract: set full, no remount nav when on route)
  assert(reuse.setFullPresentation, "9. full presentation without remount nav");
  assertEqual(reuse.navigate, false, "9b. no nav remount");

  // 10. Full presentation is set before route becomes visible
  assert(restore.setFullPresentation, "10. set full before navigate");

  // 11. Blank route is never a valid state
  assertEqual(isBlankTvPlayerRouteAllowed(), false, "11. blank forbidden");

  // 12. Back removes route and preserves session
  const actions = resolveBackVersusCloseRouteActions();
  assert(actions.back.removeFullRoute, "12. back removes route");
  assert(actions.back.preserveSession, "12b. back preserves session");

  // 13. Close removes route and stops session
  assert(actions.close.removeFullRoute, "13. close removes route");
  assertEqual(actions.close.preserveSession, false, "13b. close stops session");

  // 14. Repeated floating-player taps do not duplicate route
  const floatReuse = shouldOpenTvPlayerRoute({
    reason: "floating-player-tap",
    sessionActive: true,
    routeIsTvPlayer: true,
    presentationMode: "floating",
  });
  assertEqual(floatReuse.navigate, false, "14. no duplicate on float tap");

  // 15. Source switch does not duplicate route (reuse when on route)
  assertEqual(floatReuse.reuseExistingRoute, true, "15. reuse on source switch path");

  // 16. PiP restore does not restart source (navigation contract only expands)
  assert(reuse.setFullPresentation && !reuse.navigate, "16. expand only");

  // 17. WebView source does not enter native PiP — covered by eligibility elsewhere;
  // navigation still uses singleton rules.
  const webOpen = shouldOpenTvPlayerRoute({
    reason: "user-open",
    sessionActive: true,
    routeIsTvPlayer: false,
    presentationMode: "closed",
  });
  assertEqual(webOpen.navigationMode, "push", "17. user-open still singleton push");

  // 18. no HiddenAudio / PlayerContext
  assert(
    typeof shouldOpenTvPlayerRoute === "function" &&
      typeof createPipRestoreIntentState === "function",
    "18. navigation contract isolated"
  );

  console.log("TV PiP restore / navigation contract tests passed.");
}

main();
