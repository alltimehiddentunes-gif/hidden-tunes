/**
 * Static guards for Android performance contracts that must not regress
 * continuous-playback / call / task-removal behaviour.
 *
 * Run: node scripts/test-android-performance-guards.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testProgressUiThrottleUsesAndNotOr() {
  const player = read("context/PlayerContext.tsx");
  const apply = player.slice(
    player.indexOf("const applyHiddenAudioProgressToUi"),
    player.indexOf("const syncHiddenAudioState")
  );
  assert.ok(
    apply.includes("now - lastPositionStateUpdateRef.current >= positionStateMinMs &&"),
    "UI progress must require time gate (AND), not OR with small delta"
  );
  assert.equal(
    /positionStateMinMs \|\|[\s\S]{0,80}positionDelta/.test(apply),
    false,
    "must not OR time gate with position delta"
  );
}

function testAndroidPollSkippedWhenEventsActive() {
  const player = read("context/PlayerContext.tsx");
  assert.ok(player.includes("nativeProgressEventsActiveRef"));
  const poll = player.slice(
    player.indexOf("const pollHiddenAudioProgress"),
    player.indexOf("scheduleNextPoll")
  );
  assert.ok(poll.includes("nativeProgressEventsActiveRef.current"));
  assert.ok(poll.includes("return;"));
  // Both platforms subscribe to native progress events.
  assert.ok(player.includes("ios_hidden_audio_progress_event"));
  assert.ok(player.includes("android_hidden_audio_progress_event"));
}

function testNativeProgressSingleEmitAndDedupe() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("PROGRESS_LOOP_INTERVAL_MS = 1000L"));
  assert.ok(core.includes("emitProgress(force = false)"));
  assert.ok(core.includes("HiddenAudioProgressChanged"));
  // Unused duplicate channel must not be emitted from the progress loop path.
  const emitProgress = core.slice(
    core.indexOf("private fun emitProgress"),
    core.indexOf("private fun emitTrackChanged")
  );
  assert.equal(
    emitProgress.includes('emit("HiddenAudioProgress"'),
    false,
    "must not dual-emit HiddenAudioProgress"
  );
  assert.ok(emitProgress.includes("lastEmittedProgressPositionMs"));
}

function testContinuousDiagnosticsThrottledToJs() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("emitJsDiagnosticThrottled"));
  assert.ok(core.includes("isDebuggableBuild"));
  assert.ok(core.includes('emitJsDiagnosticThrottled("ht_android_continuous_playback"'));
  assert.ok(core.includes('emitJsDiagnosticThrottled("ht_android_lifecycle"'));
  // Logcat traces must remain.
  assert.ok(core.includes("HTAndroidContinuousPlayback"));
  assert.ok(core.includes("HTAndroidLifecycle"));
}

function testPlaybackLifecycleMarkersPreserved() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("EXOPLAYER_HANDLES_AUDIO_FOCUS = false"));
  assert.ok(core.includes("taskRemovalShutdown"));
  assert.ok(core.includes("pausedByCall"));
  assert.ok(core.includes("userOverrideDuringCall"));
  assert.ok(/handleTaskRemoved\([\s\S]*?HiddenAudioMediaSessionManager\.release\(\)/.test(core));
}

function testPerformanceTapNamespace() {
  const player = read("context/PlayerContext.tsx");
  assert.ok(player.includes("[HTAndroidPerformance]"));
  assert.ok(player.includes("logTapLatencyDiagnostic"));
}

function testContinuousDiagSkipsLockscreenCreateEntry() {
  const player = read("context/PlayerContext.tsx");
  assert.ok(player.includes('nativeEventName === "ht_android_continuous_playback"'));
  assert.ok(player.includes('nativeEventName === "ht_android_lifecycle"'));
}

console.log("test-android-performance-guards: start");
testProgressUiThrottleUsesAndNotOr();
testAndroidPollSkippedWhenEventsActive();
testNativeProgressSingleEmitAndDedupe();
testContinuousDiagnosticsThrottledToJs();
testPlaybackLifecycleMarkersPreserved();
testPerformanceTapNamespace();
testContinuousDiagSkipsLockscreenCreateEntry();
console.log("test-android-performance-guards: PASS");
