/**
 * Static guards for Android continuous playback + call/task-removal lifecycle.
 * Run: node scripts/test-android-continuous-playback.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testSingleAudioFocusOwner() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("EXOPLAYER_HANDLES_AUDIO_FOCUS = false"));
  assert.ok(
    core.includes("setAudioAttributes(audioAttributes, EXOPLAYER_HANDLES_AUDIO_FOCUS)")
  );
  assert.equal(/setAudioAttributes\([^)]*,\s*true\s*\)/.test(core), false);
  assert.ok(core.includes("fun requestAudioFocus"));
  const ensureBody = core.slice(
    core.indexOf("private fun ensurePlayer"),
    core.indexOf("exoPlayer.addListener")
  );
  assert.equal(ensureBody.includes("player?.setAudioAttributes"), false);
}

function testBufferingDoesNotTriggerPauseOrRecoverPlay() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  const isPlayingChanged = core.slice(
    core.indexOf("override fun onIsPlayingChanged"),
    core.indexOf("override fun onPlayerError")
  );
  assert.ok(isPlayingChanged.includes("exo?.playWhenReady == true"));
  assert.ok(isPlayingChanged.includes("phoneCallInterruptionActive"));
  const recover = core.slice(
    core.indexOf("private fun recoverPlaybackWhenReady"),
    core.indexOf("private fun focusChangeData")
  );
  assert.ok(recover.includes("STATE_BUFFERING") && recover.includes("return"));
  assert.ok(recover.includes("taskRemovalShutdown"));
}

function testCanDuckDoesNotPause() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  const focusHandler = core.slice(
    core.indexOf("private fun handleAudioFocusChange"),
    core.indexOf("private fun getOrCreateAudioFocusRequest")
  );
  const duckBranch = focusHandler.slice(
    focusHandler.indexOf("AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK"),
    focusHandler.indexOf("AUDIOFOCUS_GAIN")
  );
  assert.equal(duckBranch.includes("pauseForInterruption"), false);
  assert.equal(duckBranch.includes("phoneCallInterruptionActive = true"), false);
  assert.ok(duckBranch.includes("applyAudioFocusDuck"));
}

function testPlayIdempotentAndPrepareOnce() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("play_idempotent"));
  assert.ok(core.includes("fun preparePlayerOnce"));
  assert.ok(core.includes("STATE_BUFFERING || state == Player.STATE_READY"));
}

function testPausePreservesMedia() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  const pauseBody = core.slice(
    core.indexOf("private fun pauseForInterruption"),
    core.indexOf("fun stop()")
  );
  assert.equal(pauseBody.includes("clearMediaItems"), false);
  assert.equal(pauseBody.includes("exo?.stop()"), false);
  assert.ok(pauseBody.includes("exo?.pause()"));
  assert.ok(pauseBody.includes("positionMsBeforePause"));
}

function testCallStateMachine() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  for (const field of [
    "callState",
    "callInterruptionGeneration",
    "pausedByCall",
    "userOverrideDuringCall",
    "userPausedDuringCall",
    "wasPlayingBeforeCall",
    "isCallResumeEligible",
    "noteExplicitUserPlayCommand",
    "noteExplicitUserPauseCommand",
    "beginTransientCallLikeInterruption",
    "invalidateCallResumeForNewMediaSelection",
  ]) {
    assert.ok(core.includes(field), `missing ${field}`);
  }
  const focusHandler = core.slice(
    core.indexOf("private fun handleAudioFocusChange"),
    core.indexOf("private fun getOrCreateAudioFocusRequest")
  );
  assert.ok(focusHandler.includes("shouldSuppressTransientPauseForUserOverride"));
  assert.ok(focusHandler.includes("stale_call_generation") || focusHandler.includes("resumeGeneration"));
  assert.ok(focusHandler.includes("media_replaced") || focusHandler.includes("interruptedMediaKey"));
}

function testTaskRemovalFullShutdown() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("taskRemovalShutdown"));
  assert.ok(
    /handleTaskRemoved\([\s\S]*?HiddenAudioMediaSessionManager\.release\(\)/.test(core)
  );
  assert.ok(/handleTaskRemoved\([\s\S]*?abandonAudioFocus|stop\(\)/.test(core));
  assert.ok(core.includes("media_session_released"));

  const service = read("plugins/hidden-audio/android/HiddenAudioPlaybackService.kt");
  assert.ok(service.includes("override fun onDestroy"));
  assert.ok(service.includes("return START_NOT_STICKY"));
  assert.equal(service.includes("START_STICKY"), false);
}

function testContinuousAndLifecycleTraces() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("HTAndroidContinuousPlayback"));
  assert.ok(core.includes("HTAndroidLifecycle"));
  assert.ok(core.includes("ht_android_continuous_playback") || core.includes("emitJsDiagnosticThrottled"));
  assert.ok(core.includes("emitJsDiagnosticThrottled"));
  const js = read("utils/androidContinuousPlaybackTrace.ts");
  assert.ok(js.includes("[HTAndroidContinuousPlayback]"));
  assert.ok(js.includes("[HTAndroidLifecycle]"));
}

function testTogglePauseDoesNotZeroPosition() {
  const player = read("context/PlayerContext.tsx");
  const toggle = player.slice(
    player.indexOf("const togglePlayPause = useCallback"),
    player.indexOf("const sound = soundRef.current")
  );
  assert.equal(
    /bridgeHiddenAudioPause[\s\S]*?setPositionMillis\(0\)/.test(toggle),
    false,
    "pause must not zero positionMillis"
  );
}

console.log("test-android-continuous-playback: start");
testSingleAudioFocusOwner();
testBufferingDoesNotTriggerPauseOrRecoverPlay();
testCanDuckDoesNotPause();
testPlayIdempotentAndPrepareOnce();
testPausePreservesMedia();
testCallStateMachine();
testTaskRemovalFullShutdown();
testContinuousAndLifecycleTraces();
testTogglePauseDoesNotZeroPosition();
console.log("test-android-continuous-playback: PASS");
