/**
 * Static iOS ownership / config contracts for Hidden Tunes.
 * Does not require a signed iOS binary. Proves source+config wiring only.
 *
 * Run: node scripts/test-ios-static-ownership.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testSingleAvPlayerOwner() {
  const swift = read(
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift"
  );
  assert.ok(swift.includes("private var player: AVPlayer?"));
  assert.ok(swift.includes("AVPlayer(playerItem:"));
  assert.ok(swift.includes("func activateAudioSession()"));
  assert.ok(swift.includes("setCategory(.playback"));
  assert.ok(swift.includes("remoteCommandsRegistered"));
  assert.ok(swift.includes("updateNowPlayingInfo"));
  assert.ok(swift.includes("audioInterruption"));
  assert.ok(swift.includes("audioRouteChanged"));
}

function testIosHiddenAudioEnabled() {
  const cfg = read("constants/playbackConfig.ts");
  assert.ok(cfg.includes("USE_NATIVE_HIDDEN_AUDIO_ON_IOS = true"));
}

function testExpoMediaControlJsDisabledOnIos() {
  const remote = read("services/remoteMediaControls.ts");
  assert.ok(remote.includes("return Platform.OS === \"android\""));
  // Plugin may still be listed in app.json — document residual binary risk.
  const appJson = read("app.json");
  assert.ok(appJson.includes("expo-media-control"));
}

function testCarPlayEntitlementsAndScenes() {
  const appJson = JSON.parse(read("app.json"));
  const ents = appJson.expo.ios.entitlements;
  assert.equal(ents["com.apple.developer.carplay-audio"], true);
  assert.equal(ents["com.apple.developer.carplay-video"], undefined);
  assert.ok(
    appJson.expo.ios.infoPlist.UIBackgroundModes.includes("audio")
  );

  const plugin = read("plugins/hidden-audio/index.js");
  assert.ok(plugin.includes("com.apple.developer.carplay-audio"));
  assert.ok(plugin.includes('delete config.modResults["com.apple.developer.carplay-video"]'));
  assert.ok(plugin.includes("CarPlaySceneDelegate"));
  assert.ok(plugin.includes("PhoneSceneDelegate"));

  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioCarPlayManager.swift"
      )
    )
  );
  assert.ok(
    fs.existsSync(
      path.join(
        root,
        "plugins/hidden-audio/ios/HiddenAudioModule/CarPlaySceneDelegate.swift"
      )
    )
  );
}

function testTvPipSingleSurfaceIntent() {
  const surface = read("components/tv/TvNativeVideoSurfaceImpl.tsx");
  assert.ok(surface.includes("useVideoPlayer"));
  assert.ok(
    /supportsPictureInPicture|pictureInPicture|startPictureInPicture/i.test(
      surface
    )
  );
  const appJson = read("app.json");
  assert.ok(appJson.includes("supportsPictureInPicture"));
  assert.ok(appJson.includes("supportsBackgroundPlayback"));
}

function testKnownIosHeatHotspotsDocumented() {
  const swift = read(
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift"
  );
  // Progress / Now Playing elapsed must not tick at 0.5s.
  assert.ok(swift.includes("CMTime(seconds: 1.0"));
  assert.equal(
    swift.includes("CMTime(seconds: 0.5"),
    false,
    "progress observer must not use 0.5s interval"
  );
  assert.ok(swift.includes("updateNowPlayingElapsed"));
  assert.ok(swift.includes("lastNowPlayingElapsedFloor"));
  assert.ok(swift.includes("emitProgress(force: false)"));
  assert.ok(swift.includes("HiddenAudioProgressChanged"));
  const emitProgress = swift.slice(
    swift.indexOf("private func emitProgress"),
    swift.indexOf("private func emitTrackChanged")
  );
  assert.equal(
    emitProgress.includes('sendEvent(withName: "HiddenAudioProgress"'),
    false,
    "must not dual-emit HiddenAudioProgress"
  );
  assert.ok(swift.includes("needsCategory"));
  // Session reassert sites exist (every play/load risk) but setCategory is gated.
  const activateCount = (swift.match(/activateAudioSession\(\)/g) || []).length;
  assert.ok(
    activateCount >= 4,
    `expected multiple activateAudioSession call sites, got ${activateCount}`
  );
}

function testIosProgressPollSkippedWhenEventsActive() {
  const player = read("context/PlayerContext.tsx");
  assert.ok(player.includes("nativeProgressEventsActiveRef"));
  assert.ok(player.includes("ios_hidden_audio_progress_event"));
  const poll = player.slice(
    player.indexOf("const pollHiddenAudioProgress"),
    player.indexOf("scheduleNextPoll")
  );
  assert.ok(poll.includes("nativeProgressEventsActiveRef.current"));
  assert.ok(!poll.includes('Platform.OS === "android"'));
}

function testIosInterruptionResumeGatePreserved() {
  const swift = read(
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift"
  );
  const start = swift.indexOf("@objc private func audioInterruption");
  const end = swift.indexOf("@objc private func audioRouteChanged");
  assert.ok(start >= 0 && end > start);
  const body = swift.slice(start, end);
  assert.ok(body.includes("wasPlayingBeforeInterruption"));
  assert.ok(body.includes("shouldResumeOption"));
  assert.ok(body.includes("hasRecentIntentionalPause()"));
  assert.equal(body.includes("player?.play()"), false);
  assert.ok(body.includes("PlayerContext applies latest-tap / owner policy"));

  const playerContext = read("context/PlayerContext.tsx");
  const endedHandler = playerContext.slice(
    playerContext.indexOf('nativeEventName === "ios_call_interruption_ended"'),
    playerContext.indexOf('nativeEventName === "android_audio_focus_pause_for_interruption"')
  );
  assert.ok(endedHandler.includes("decision.shouldResume"));
  assert.ok(endedHandler.includes("bridgeHiddenAudioPlay()"));
}

function testRouteChangeIsLogOnly() {
  const swift = read(
    "plugins/hidden-audio/ios/HiddenAudioModule/HiddenAudioModule.swift"
  );
  const start = swift.indexOf("@objc private func audioRouteChanged");
  const end = swift.indexOf("@objc private func silenceSecondaryAudioHint");
  assert.ok(start >= 0 && end > start, "audioRouteChanged function must exist");
  const route = swift.slice(start, end);
  assert.ok(route.includes("emitDiagnostic"));
  assert.ok(route.includes("ios_audio_session_route_changed"));
  assert.equal(
    /player\?\.pause\(\)|player\?\.play\(\)/.test(route),
    false,
    "route-change handler must not currently pause/play (log-only)"
  );
}

function testAndroidDirtyWorkStillPresent() {
  const core = read("plugins/hidden-audio/android/HiddenAudioCore.kt");
  assert.ok(core.includes("EXOPLAYER_HANDLES_AUDIO_FOCUS = false"));
  assert.ok(core.includes("taskRemovalShutdown"));
  assert.ok(core.includes("pausedByCall"));
}

function testBundleIdentity() {
  const appJson = JSON.parse(read("app.json"));
  assert.equal(appJson.expo.ios.bundleIdentifier, "com.hiddentunes.app");
  assert.equal(appJson.expo.version, "1.0.2");
  assert.equal(appJson.expo.ios.buildNumber, "1.0.210");
}

console.log("test-ios-static-ownership: start");
testSingleAvPlayerOwner();
testIosHiddenAudioEnabled();
testExpoMediaControlJsDisabledOnIos();
testCarPlayEntitlementsAndScenes();
testTvPipSingleSurfaceIntent();
testKnownIosHeatHotspotsDocumented();
testIosProgressPollSkippedWhenEventsActive();
testIosInterruptionResumeGatePreserved();
testRouteChangeIsLogOnly();
testAndroidDirtyWorkStillPresent();
testBundleIdentity();
console.log("test-ios-static-ownership: PASS");
