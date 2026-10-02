/**
 * Source contract: one diagnostic binary must expose all steady-PLAYING isolation modes.
 * Run: node scripts/test-ios217-diagnostic-isolation-modes.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("D:/HiddenTunes/Worktrees/ios217-perf-dev");
const swift = readFileSync(
  resolve(root, "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift"),
  "utf8"
);
const ts = readFileSync(resolve(root, "utils/ios217NativePerf.ts"), "utf8");

const requiredModes = [
  "normal",
  "quiet_diagnostics",
  "event_minimum",
  "no_redundant_state",
  "no_now_playing_periodic",
  "no_periodic_confirm",
  "no_periodic_ancillary",
  "audio_core_only",
];

for (const mode of requiredModes) {
  assert.match(swift, new RegExp(`"${mode}"`), `Swift allowlist missing ${mode}`);
  assert.match(ts, new RegExp(`"${mode}"`), `TS isolation list missing ${mode}`);
}

assert.match(swift, /suppressesRedundantStateEmit/, "redundant state helper missing");
assert.match(swift, /suppressesNowPlayingElapsed/, "now playing elapsed helper missing");
assert.match(swift, /suppressesPeriodicConfirmWhenAlreadyPlaying/, "periodic confirm helper missing");
assert.match(swift, /suppressesProgressWhilePlaying/, "progress suppress helper missing");
assert.match(swift, /suppressesPeriodicObserver/, "periodic observer helper missing");
assert.match(
  swift,
  /if !force && suppressesRedundantStateEmit\(\) && key == lastEmittedStateKey/,
  "event_minimum must skip unchanged HiddenAudioState sendEvent"
);
assert.match(
  swift,
  /suppressesPeriodicConfirmWhenAlreadyPlaying\(\) && alreadyConfirmedPlaying/,
  "no_periodic_confirm must skip confirm when already playing"
);
assert.match(
  swift,
  /if !self\.suppressesNowPlayingElapsed\(\)/,
  "no_now_playing_periodic must gate updateNowPlayingElapsed"
);

// Existing compiled binary (pre-rebuild) cannot isolate emitState alone.
const installedBinaryModes = [
  "normal",
  "no_elapsed",
  "no_periodic",
  "audio_only",
  "no_periodic_no_print",
  "no_periodic_no_bridge",
  "quiet_diagnostics",
];
assert.ok(
  !installedBinaryModes.includes("event_minimum"),
  "sanity: installed binary allowlist historically lacked event_minimum"
);

console.log("PASS ios217 diagnostic isolation modes source contract");
console.log(
  JSON.stringify(
    {
      EXISTING_BINARY_CAN_TEST_EVENT_MINIMUM: false,
      EVENT_MINIMUM_REQUIRES_DIAGNOSTIC_REBUILD: true,
      ALL_NATIVE_SWITCHES_IN_SOURCE: requiredModes,
      CLOSEST_EXISTING_PARTIAL: {
        no_now_playing_periodic: "no_elapsed (already compiled)",
        audio_core_only: "audio_only (already compiled; also kills progress)",
        event_minimum: "NONE — still emits HiddenAudioState every confirm tick",
      },
    },
    null,
    2
  )
);
