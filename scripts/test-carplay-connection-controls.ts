import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manager = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift");
const scene = read("plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift");
const native = read("plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift");
const player = read("context/PlayerContext.tsx");
const bridge = read("src/hidden-audio/hiddenAudioBridge.ts");
const playbackBridge = read("services/playbackBridge.ts");
const resolver = read("services/carPlayMediaResolver.ts");
const premium = read("services/carPlayPremiumCatalog.ts");
const interruption = read("services/playback/iosAudioInterruptionGate.ts");

assert.match(scene, /makeImmediateFallbackRoot\(\)/);
assert.match(scene, /installSafeRoot/);
const connectBody = manager.slice(manager.indexOf("func connect("), manager.indexOf("func disconnect()"));
assert.doesNotMatch(connectBody, /playCarPlayTrack|\.play\(\)|loadActiveTrack|routeRadioPlayback/);
assert.doesNotMatch(connectBody, /fetch\(|Home|RCTRootView|UIWindow\(/);
assert.match(manager, /CPNowPlayingTemplate\.shared/);
assert.equal((manager.match(/CPNowPlayingTemplate\.shared/g) || []).length, 1);
assert.match(manager, /disconnected playback_preserved=1/);
assert.match(manager, /cancelOutstandingRequests\(\)/);

assert.match(native, /if remoteCommandsRegistered \{ return \}/);
for (const command of ["playCommand", "pauseCommand", "togglePlayPauseCommand",
  "nextTrackCommand", "previousTrackCommand", "changePlaybackPositionCommand"]) {
  assert.equal((native.match(new RegExp(`${command}\\.addTarget`, "g")) || []).length, 1, command);
}
assert.match(native, /skipForwardCommand\.isEnabled = false/);
assert.match(native, /skipBackwardCommand\.isEnabled = false/);

assert.match(native, /markIntentionalPause\(reason: "remote_pause"\)/);
assert.match(native, /hasRecentIntentionalPause\(\) && playerStatus == "paused"/);
assert.match(native, /Do NOT play\(\) here/);
assert.match(interruption, /evaluateIosInterruptionResumePolicy/);
assert.match(player, /isPlayingRef\.current = false;[\s\S]*setIsPlayingState\(false\)/);

for (const field of ["currentSongId", "queueIds", "queueIndex", "positionMillis",
  "isPlaying", "contextSource", "queueMode", "context", "savedAt"]) {
  assert.match(player, new RegExp(`${field}:`), field);
}
assert.equal((player.match(/hidden_tunes_compact_playback_session_v1/g) || []).length, 1);

assert.match(player, /runQueueTransition/);
assert.match(player, /finally \{[\s\S]*queueTransitionRef\.current = false/);
assert.match(player, /routeRadioPlayback/);
assert.match(player, /activeQueueModeRef\.current === "live_stream"/);
assert.match(player, /isPodcastPlaybackDomain/);
assert.match(resolver, /queueType: "podcast"/);
assert.match(resolver, /queueType: "audiobook"/);
assert.match(resolver, /const domainQueue = isRadio \? \[song\] : queue/);
assert.match(premium, /resumePositionMillis/);

assert.match(bridge, /isLiveStream: metadata\?\.isLiveStream === true/);
assert.match(playbackBridge, /isLiveStream: options\.isLiveStream === true/);
assert.match(native, /activeTrackIsLiveStream\(\)/);
assert.match(native, /reason: "live_stream_no_seek"/);
assert.match(native, /requestedPosition\.isFinite/);
assert.match(native, /let clampedPosition = min\(requestedPosition, duration\)/);
assert.match(native, /MPNowPlayingInfoPropertyIsLiveStream/);

console.log("carplay-connection-controls: PASS");
