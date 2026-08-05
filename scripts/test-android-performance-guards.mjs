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

function extractIfConditionContaining(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing progress-gate marker: ${marker}`);
  const ifIndex = source.lastIndexOf("if (", markerIndex);
  assert.notEqual(ifIndex, -1, "missing progress-gate if statement");
  const openIndex = source.indexOf("(", ifIndex);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  assert.fail("unterminated progress-gate condition");
}

function topLevelLogicalOperators(expression) {
  const operators = [];
  let depth = 0;
  for (let index = 0; index < expression.length - 1; index += 1) {
    const char = expression[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    const pair = expression.slice(index, index + 2);
    if (depth === 0 && (pair === "&&" || pair === "||")) {
      operators.push(pair);
      index += 1;
    }
  }
  return operators;
}

function assertValidProgressGate(expression) {
  const compact = expression.replace(/\s+/g, "");
  assert.match(
    compact,
    /now-lastPositionStateUpdateRef\.current>=Math\.max\(0,positionStateMinMs-POSITION_STATE_UPDATE_JITTER_TOLERANCE_MS\)/,
    "time gate must use a zero-bounded jitter-tolerant threshold"
  );
  assert.match(
    compact,
    /Math\.abs\(progress\.positionMillis-previousPosition\)>=positionDeltaMinMs/,
    "position-delta gate must remain present"
  );
  assert.deepEqual(
    topLevelLogicalOperators(expression),
    ["&&"],
    "time and position-delta gates must be combined by one top-level AND"
  );
}

function allowsProgressUiUpdate({ elapsed, minimum, jitter, delta, deltaMinimum }) {
  return (
    elapsed >= Math.max(0, minimum - jitter) &&
    Math.abs(delta) >= deltaMinimum
  );
}

function testProgressUiThrottleUsesAndNotOr() {
  const player = read("context/PlayerContext.tsx");
  const apply = player.slice(
    player.indexOf("const applyHiddenAudioProgressToUi"),
    player.indexOf("const syncHiddenAudioState")
  );
  const condition = extractIfConditionContaining(
    apply,
    "POSITION_STATE_UPDATE_JITTER_TOLERANCE_MS"
  );
  assertValidProgressGate(condition);

  const base = {
    minimum: 1000,
    jitter: 100,
    deltaMinimum: 400,
  };
  assert.equal(allowsProgressUiUpdate({ ...base, elapsed: 899, delta: 400 }), false);
  assert.equal(allowsProgressUiUpdate({ ...base, elapsed: 900, delta: 399 }), false);
  assert.equal(allowsProgressUiUpdate({ ...base, elapsed: 900, delta: 400 }), true);
  assert.equal(
    allowsProgressUiUpdate({ ...base, minimum: 50, jitter: 100, elapsed: 0, delta: 400 }),
    true,
    "jitter tolerance must clamp the effective threshold at zero"
  );

  const compact = condition.replace(/\s+/g, "");
  const timeGate =
    "now-lastPositionStateUpdateRef.current>=Math.max(0,positionStateMinMs-POSITION_STATE_UPDATE_JITTER_TOLERANCE_MS)";
  const deltaGate =
    "Math.abs(progress.positionMillis-previousPosition)>=positionDeltaMinMs";
  assert.throws(() => assertValidProgressGate(compact.replace("&&", "||")));
  assert.throws(() => assertValidProgressGate(compact.replace(`${timeGate}&&`, "")));
  assert.throws(() => assertValidProgressGate(compact.replace(`&&${deltaGate}`, "")));
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
