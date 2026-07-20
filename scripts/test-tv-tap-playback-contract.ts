import {
  decideTvBrowseTap,
  resolveTvTapPlaybackContract,
  shouldApplyTvBrowseTapResult,
  shouldStopExistingTvOnBrowseTap,
} from "../services/tv/tvTapPlaybackContract";

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
  const c = resolveTvTapPlaybackContract();
  assert(c.firstTapBecomesActiveImmediately, "1. first tap active");
  assert(c.oneRequestPerAcceptedTap, "2. one request");
  assert(c.sameCardDoubleTapSuppressed, "3. double suppress");
  assert(c.newerTapSupersedesStale, "4. B wins");
  assert(c.staleSuccessIgnored, "5. stale success ignored");
  assert(c.staleFailureIgnored, "6. stale failure ignored");
  assert(c.oldPlaybackRelinquishesOnAcceptedSwitch, "7. old relinquishes");
  assert(c.newSourceAppliedOnce, "8. source once");
  assert(c.playerRouteSingleton, "11. singleton route");
  assert(c.noPlayerInsideCard, "14. no card player");
  assertEqual(c.referencesHiddenAudio, false, "15. no HiddenAudio");

  const first = decideTvBrowseTap({
    tappedId: "a",
    inFlightId: null,
    generation: 0,
  });
  assertEqual(first.action, "accept", "1b. accept first");
  assertEqual(first.nextGeneration, 1, "1c. gen");

  const dup = decideTvBrowseTap({
    tappedId: "a",
    inFlightId: "a",
    generation: 1,
  });
  assertEqual(dup.action, "suppress", "3b. same in flight");

  const switchTap = decideTvBrowseTap({
    tappedId: "b",
    inFlightId: "a",
    generation: 1,
  });
  assertEqual(switchTap.action, "accept", "4b. switch accept");
  assertEqual(switchTap.nextGeneration, 2, "4c. gen bump");

  assert(
    !shouldApplyTvBrowseTapResult({ resultGeneration: 1, latestGeneration: 2 }),
    "5b. stale ignored"
  );
  assert(
    shouldApplyTvBrowseTapResult({ resultGeneration: 2, latestGeneration: 2 }),
    "5c. latest applied"
  );

  assert(
    shouldStopExistingTvOnBrowseTap({
      tappedId: "b",
      activeItemId: "a",
      sessionActive: true,
    }),
    "7b. stop on switch"
  );
  assert(
    !shouldStopExistingTvOnBrowseTap({
      tappedId: "a",
      activeItemId: "a",
      sessionActive: true,
    }),
    "7c. no stop same"
  );

  console.log("PASS: tv-tap-playback-contract");
}

main();
