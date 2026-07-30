/**
 * Focused iOS call-interruption gate contracts.
 * Run: npx --yes tsx scripts/test-ios-call-interruption-gate.ts
 */

import {
  __resetIosAudioInterruptionForTests,
  beginIosAudioInterruption,
  clearIosAudioInterruption,
  endIosAudioInterruption,
  evaluateIosInterruptionResumePolicy,
  getIosAudioInterruptionSnapshot,
  isIosAudioInterruptionActive,
  markIosInterruptionMediaReplaced,
  markIosInterruptionUserPaused,
  noteIosInterruptionAppState,
  subscribeIosAudioInterruption,
} from "../services/playback/iosAudioInterruptionGate";

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
  __resetIosAudioInterruptionForTests();

  // 1–2. Began once; duplicate ignored
  const began = beginIosAudioInterruption({
    sequenceId: 1,
    wasPlaying: true,
    owner: "shared-audio",
    loadRequestId: 10,
    tapId: 3,
  });
  assert(began.accepted, "interruption begins once");
  assert(isIosAudioInterruptionActive(), "gate active after began");
  const dup = beginIosAudioInterruption({
    sequenceId: 1,
    wasPlaying: true,
    owner: "shared-audio",
    loadRequestId: 10,
    tapId: 3,
  });
  assertEqual(dup.accepted, false, "duplicate began ignored");
  assertEqual(dup.reason, "duplicate_began", "duplicate reason");

  // 3. AppState notes during interruption (no side effects beyond recording)
  noteIosInterruptionAppState("inactive");
  noteIosInterruptionAppState("background");
  noteIosInterruptionAppState("background");
  const snap = getIosAudioInterruptionSnapshot();
  assertEqual(snap.appStateDuring.join(","), "inactive,background", "app state recorded once each");

  // 4–5. Resume policy: AppState alone must not resume — only endIosAudioInterruption
  assert(isIosAudioInterruptionActive(), "still active before end");

  // 6–7. shouldResume=true → resume once
  const resumeOk = endIosAudioInterruption({
    sequenceId: 1,
    shouldResume: true,
    wasPlaying: true,
    currentOwner: "shared-audio",
    currentLoadRequestId: 10,
    currentTapId: 3,
  });
  assertEqual(resumeOk.shouldResume, true, "resume occurs once when eligible");
  assertEqual(resumeOk.reason, "ok", "resume reason ok");
  assertEqual(isIosAudioInterruptionActive(), false, "gate cleared after end");

  // 12. Duplicate ended does not resume twice
  const resumeDup = endIosAudioInterruption({
    sequenceId: 1,
    shouldResume: true,
    currentOwner: "shared-audio",
    currentLoadRequestId: 10,
    currentTapId: 3,
  });
  assertEqual(resumeDup.shouldResume, false, "duplicate ended does not resume");
  assertEqual(resumeDup.reason, "no_active_interruption", "no active after clear");

  // 8. Manual pause blocks resume
  __resetIosAudioInterruptionForTests();
  beginIosAudioInterruption({
    sequenceId: 2,
    wasPlaying: true,
    owner: "shared-audio",
    loadRequestId: 1,
    tapId: 1,
  });
  markIosInterruptionUserPaused();
  const paused = endIosAudioInterruption({
    sequenceId: 2,
    shouldResume: true,
    currentOwner: "shared-audio",
    currentLoadRequestId: 1,
    currentTapId: 1,
  });
  assertEqual(paused.shouldResume, false, "manual pause blocks resume");
  assertEqual(paused.reason, "user_paused_during", "pause reason");

  // 9. New media tap blocks stale resume
  __resetIosAudioInterruptionForTests();
  beginIosAudioInterruption({
    sequenceId: 3,
    wasPlaying: true,
    owner: "shared-audio",
    loadRequestId: 5,
    tapId: 5,
  });
  markIosInterruptionMediaReplaced();
  const replaced = endIosAudioInterruption({
    sequenceId: 3,
    shouldResume: true,
    currentOwner: "shared-audio",
    currentLoadRequestId: 6,
    currentTapId: 6,
  });
  assertEqual(replaced.shouldResume, false, "new media tap blocks stale resume");
  assert(
    replaced.reason === "media_replaced_during" ||
      replaced.reason === "load_request_changed" ||
      replaced.reason === "tap_id_changed",
    "replacement reason recorded"
  );

  // 10. Owner change blocks resume
  __resetIosAudioInterruptionForTests();
  beginIosAudioInterruption({
    sequenceId: 4,
    wasPlaying: true,
    owner: "shared-audio",
    loadRequestId: 1,
    tapId: 1,
  });
  const ownerChanged = endIosAudioInterruption({
    sequenceId: 4,
    shouldResume: true,
    currentOwner: "tv",
    currentLoadRequestId: 1,
    currentTapId: 1,
  });
  assertEqual(ownerChanged.shouldResume, false, "owner change blocks resume");
  assertEqual(ownerChanged.reason, "owner_changed", "owner_changed reason");

  // 11. Mismatched sequence ignored
  __resetIosAudioInterruptionForTests();
  beginIosAudioInterruption({
    sequenceId: 7,
    wasPlaying: true,
    owner: "shared-audio",
    loadRequestId: 1,
    tapId: 1,
  });
  const mismatch = endIosAudioInterruption({
    sequenceId: 99,
    shouldResume: true,
    currentOwner: "shared-audio",
    currentLoadRequestId: 1,
    currentTapId: 1,
  });
  assertEqual(mismatch.shouldResume, false, "mismatched sequence ignored");
  assertEqual(mismatch.reason, "sequence_mismatch", "sequence_mismatch reason");
  assert(isIosAudioInterruptionActive(), "gate remains active after mismatch");
  clearIosAudioInterruption("test_cleanup");

  // Pure policy evaluator (TV owner never auto-resumes HiddenAudio)
  const tvPolicy = evaluateIosInterruptionResumePolicy({
    active: true,
    sequenceId: 1,
    eventSequenceId: 1,
    shouldResume: true,
    wasPlaying: true,
    userPausedDuring: false,
    mediaReplacedDuring: false,
    resumeAttempted: false,
    owner: "tv",
    currentOwner: "tv",
    loadRequestId: 1,
    currentLoadRequestId: 1,
    tapId: 1,
    currentTapId: 1,
  });
  assertEqual(tvPolicy.shouldResume, false, "TV owner does not HiddenAudio-resume");
  assertEqual(tvPolicy.reason, "owner_not_shared_audio", "tv reason");

  // 13–14. Subscribe: active true then false once (TV NP republish trigger)
  __resetIosAudioInterruptionForTests();
  const transitions: boolean[] = [];
  const unsub = subscribeIosAudioInterruption((active) => {
    transitions.push(active);
  });
  beginIosAudioInterruption({
    sequenceId: 8,
    wasPlaying: true,
    owner: "tv",
    loadRequestId: 1,
    tapId: 1,
  });
  endIosAudioInterruption({
    sequenceId: 8,
    shouldResume: true,
    currentOwner: "tv",
    currentLoadRequestId: 1,
    currentTapId: 1,
  });
  unsub();
  assertEqual(transitions.join(","), "true,false", "subscriber sees begin then clear once");

  // 15. Listener cleanup — no throw after unsub
  beginIosAudioInterruption({
    sequenceId: 9,
    wasPlaying: false,
    owner: "shared-audio",
    loadRequestId: 1,
    tapId: 1,
  });
  clearIosAudioInterruption("done");

  console.log("OK: iOS call interruption gate contracts passed");
}

main();
