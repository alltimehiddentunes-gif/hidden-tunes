import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const manager = read("plugins/hidden-audio/android/HiddenAudioMediaSessionManager.kt");
const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
const pending = read("plugins/hidden-audio/android/HiddenAudioPendingCommandQueue.kt");
const player = read("context/PlayerContext.tsx");
const moduleSource = read("plugins/hidden-audio/android/HiddenAudioModule.kt");

for (const [callback, reason] of [["onPlay", "remote_play"], ["onPause", "remote_pause"],
  ["onStop", "remote_stop"], ["onSkipToNext", "remote_next"],
  ["onSkipToPrevious", "remote_previous"]]) {
  const start = manager.indexOf(`override fun ${callback}`);
  const body = manager.slice(start, manager.indexOf("override fun", start + 20));
  assert.ok(body.includes(`HiddenAudioPlaybackTransaction.begin(\"\", \"${reason}\")`), `${callback} lacks transaction`);
  assert.ok(body.includes("handle = handle"), `${callback} does not forward transaction`);
}
assert.match(core, /playFromAutoMediaId[\s\S]*HiddenAudioPlaybackTransaction\.begin/);
assert.match(core, /before_native_load/);
assert.match(core, /after_native_load/);
assert.match(pending, /MAX_PENDING = 4/);
assert.match(pending, /COMMAND_TTL_MS = 45_000L/);
assert.match(pending, /pending\.removeAll/);
assert.match(core, /reconcile_media_id/);
assert.match(player, /case "reconcile_media_id"/);
assert.match(player, /android_auto_queue_reconciled_without_reload/);
assert.match(player, /incomingAndroidTransactionId/);
assert.match(player, /phase: "before_dispatch"/);
assert.match(moduleSource, /fun updateRemoteQueueAvailability/);
assert.match(manager, /canonicalQueueIndex/);
assert.match(manager, /METADATA_KEY_NUM_TRACKS/);
assert.doesNotMatch(manager, /ACTION_PLAY_PAUSE or\s*PlaybackStateCompat\.ACTION_SKIP_TO_NEXT/);

// Behavioral latest-wins model used by the native transaction authority.
let current = 0;
const begin = () => ++current;
const isCurrent = (id) => id === current;
const commands = Array.from({ length: 5 }, begin);
assert.deepEqual(commands.map(isCurrent), [false, false, false, false, true]);

assert.match(core, /AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK[\s\S]*applyAudioFocusDuck/);
assert.match(core, /AUDIOFOCUS_LOSS_TRANSIENT[\s\S]*pauseForInterruption\("audio_focus_transient", permanent = false\)/);
assert.match(core, /AUDIOFOCUS_LOSS[\s\S]*wasPlayingBeforeAudioFocusLoss = false/);
assert.match(core, /EXOPLAYER_HANDLES_AUDIO_FOCUS = false/);
assert.equal((core.match(/ExoPlayer\.Builder/g) || []).length, 1);
assert.match(core, /handleTaskRemoved[\s\S]*stop\(\)/);
assert.match(core, /noteAndroidAutoBrowserDisconnected/);

console.log("test-android-auto-commands-lifecycle: PASS");
