/**
 * Static policy proofs for Android Recents swipe-away vs normal background.
 * Run: node scripts/test-android-task-removed-policy.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function shouldPreservePlaybackAfterTaskRemoved({
  androidAutoBrowserClients,
  isPlaybackActive,
}) {
  // Product rule: deliberate Recents clear never preserves for Android Auto.
  return false;
}

function decideTaskRemovedAction(state) {
  if (shouldPreservePlaybackAfterTaskRemoved(state)) {
    return "preserve_for_android_auto";
  }
  return "stop_and_latch_dismissed";
}

function testNormalBackgroundDoesNotStop() {
  // Home/lock never call handleTaskRemoved — only Service.onTaskRemoved does.
  const service = read("plugins/hidden-audio/android/HiddenAudioPlaybackService.kt");
  assert.ok(service.includes("override fun onTaskRemoved"));
  assert.ok(service.includes("HiddenAudioCore.handleTaskRemoved()"));
  // Background notify must not stop playback by itself.
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("fun notifyAppBackgrounded()"));
  const notifyBody = core.slice(
    core.indexOf("fun notifyAppBackgrounded()"),
    core.indexOf("fun noteAndroidAutoBrowserConnected")
  );
  assert.equal(notifyBody.includes("stop("), false);
  assert.equal(notifyBody.includes("handleTaskRemoved"), false);
}

function testExplicitTaskRemovalStops() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("fun handleTaskRemoved()"));
  assert.equal(core.includes("android_task_removed_ignored_recent_background"), false);
  assert.ok(core.includes("intentional_app_close_detected"));
  assert.ok(core.includes("persistTaskRemovedDismissed(true)"));
  assert.ok(core.includes("appTaskRemoved = true"));
  assert.ok(core.includes("taskRemovalShutdown = true"));
  assert.ok(/handleTaskRemoved\([\s\S]*?stop\(\)/.test(core));
  assert.ok(/handleTaskRemoved\([\s\S]*?HiddenAudioMediaSessionManager\.release\(\)/.test(core));

  assert.equal(
    decideTaskRemovedAction({
      androidAutoBrowserClients: 0,
      isPlaybackActive: true,
    }),
    "stop_and_latch_dismissed"
  );
  assert.equal(
    decideTaskRemovedAction({
      androidAutoBrowserClients: 0,
      isPlaybackActive: false,
    }),
    "stop_and_latch_dismissed"
  );
}

function testTaskRemovalBlocksReassert() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("fun reassertBackgroundPlayback"));
  assert.ok(
    /reassertBackgroundPlayback[\s\S]*?syncTaskRemovedFromDisk\(\)[\s\S]*?appTaskRemoved/.test(
      core
    )
  );
  assert.ok(core.includes("android_foreground_service_start_blocked_task_removed"));
  assert.ok(core.includes("background_recovery_blocked_by_interruption"));
  assert.ok(core.includes("taskRemovalShutdown"));

  const player = read("context/PlayerContext.tsx");
  assert.ok(player.includes("background_30s_watch_task_removed"));
  assert.ok(player.includes("app_state_background_reassert_task_removed"));
}

function testFreshLaunchDoesNotAutoResume() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("clearUserDismissedTaskFlag(\"load_track\")"));
  assert.ok(core.includes("clearUserDismissedTaskFlag(\"play\")"));
  assert.ok(core.includes("android_task_removed_cleared"));

  const player = read("context/PlayerContext.tsx");
  assert.ok(player.includes("hydration_skipped_after_intentional_close"));
  assert.ok(player.includes("INTENTIONAL_APP_CLOSE_KEY"));
  assert.ok(player.includes("saved_session_invalidated_after_task_removed"));
}

function testAndroidAutoDoesNotPreserveOnTaskRemoval() {
  assert.equal(
    decideTaskRemovedAction({
      androidAutoBrowserClients: 1,
      isPlaybackActive: true,
    }),
    "stop_and_latch_dismissed"
  );
  assert.equal(
    decideTaskRemovedAction({
      androidAutoBrowserClients: 1,
      isPlaybackActive: false,
    }),
    "stop_and_latch_dismissed"
  );
  assert.equal(
    decideTaskRemovedAction({
      androidAutoBrowserClients: 0,
      isPlaybackActive: true,
    }),
    "stop_and_latch_dismissed"
  );

  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("shouldPreservePlaybackAfterTaskRemoved"));
  assert.ok(/shouldPreservePlaybackAfterTaskRemoved\(\): Boolean \{\s*return false\s*\}/.test(core));
  assert.equal(core.includes("android_task_removed_preserved_for_android_auto"), false);

  const browser = read(
    "plugins/hidden-audio/android/HiddenAudioMediaBrowserService.kt"
  );
  assert.ok(browser.includes("noteAndroidAutoBrowserConnected"));
  assert.ok(browser.includes("noteAndroidAutoBrowserDisconnected"));
  assert.ok(browser.includes("override fun onUnbind"));

  const service = read("plugins/hidden-audio/android/HiddenAudioPlaybackService.kt");
  assert.equal(service.includes("preserveForAndroidAuto"), false);
  assert.ok(service.includes("stopSelf()"));
}

function testNotStickyAfterDismiss() {
  const service = read("plugins/hidden-audio/android/HiddenAudioPlaybackService.kt");
  assert.ok(service.includes("return START_NOT_STICKY"));
  assert.equal(service.includes("START_STICKY"), false);
  assert.ok(service.includes("override fun onDestroy"));
}

function testIosUntouched() {
  const ios = read(
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift"
  );
  assert.equal(ios.includes("handleTaskRemoved"), false);
  assert.equal(ios.includes("appTaskRemoved"), false);
}

function main() {
  console.log("test-android-task-removed-policy: start");
  testNormalBackgroundDoesNotStop();
  testExplicitTaskRemovalStops();
  testTaskRemovalBlocksReassert();
  testFreshLaunchDoesNotAutoResume();
  testAndroidAutoDoesNotPreserveOnTaskRemoval();
  testNotStickyAfterDismiss();
  testIosUntouched();
  console.log("test-android-task-removed-policy: PASS");
}

main();
