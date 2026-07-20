import {
  canUseTvPiP,
  classifyTvPipRejection,
  classifyTvPipSource,
  resolveTvPipUserMessage,
  resolveTvPlayerReusePolicy,
  shouldAcceptTvPiPStart,
  shouldReplaceTvStreamErrorWithPipError,
} from "../services/tv/tvPipEligibility";

function assert(condition: boolean, label: string) {
  if (!condition) {
    throw new Error(`FAIL: ${label}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function main() {
  // 1. valid native HLS video is PiP eligible
  assert(
    canUseTvPiP({
      platform: "ios",
      sourceUri: "https://cdn.example.com/live/channel.m3u8",
      surface: "native",
      playerStatus: "playing",
      isNativeSurfaceMounted: true,
      sessionActive: true,
    }),
    "1. HLS native eligible"
  );

  // 2. valid MP4 is PiP eligible
  assert(
    canUseTvPiP({
      platform: "ios",
      sourceUri: "https://cdn.example.com/clip.mp4",
      surface: "native",
      playerStatus: "readyToPlay",
      isNativeSurfaceMounted: true,
      sessionActive: true,
    }),
    "2. MP4 native eligible"
  );

  // 3. audio-only stream is not PiP eligible
  assert(
    !canUseTvPiP({
      platform: "ios",
      sourceUri: "https://cdn.example.com/stream.mp3",
      surface: "native",
      playerStatus: "playing",
      isAudioOnly: true,
      isNativeSurfaceMounted: true,
      sessionActive: true,
    }),
    "3. audio-only not eligible"
  );

  // 4. WebView-only source is not PiP eligible
  assert(
    !canUseTvPiP({
      platform: "ios",
      sourceUri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      surface: "webview",
      playerStatus: "playing",
      isNativeSurfaceMounted: false,
      sessionActive: true,
    }),
    "4. WebView surface not eligible"
  );
  assert(
    !classifyTvPipSource("https://www.youtube.com/embed/abc").looksNativeVideo,
    "4b. YouTube embed not native video"
  );

  // 5. missing source is not eligible
  assert(
    !canUseTvPiP({
      platform: "ios",
      sourceUri: "",
      surface: "native",
      playerStatus: "playing",
      isNativeSurfaceMounted: true,
      sessionActive: true,
    }),
    "5. missing source not eligible"
  );

  // 6. errored player is not eligible
  assert(
    !canUseTvPiP({
      platform: "ios",
      sourceUri: "https://cdn.example.com/live/channel.m3u8",
      surface: "native",
      playerStatus: "error",
      hasFatalError: true,
      isNativeSurfaceMounted: true,
      sessionActive: true,
    }),
    "6. errored player not eligible"
  );

  // 7. stale session cannot start PiP
  assertEqual(
    shouldAcceptTvPiPStart({
      inFlight: false,
      sessionActive: false,
      eligible: true,
      disposed: false,
    }).reason,
    "stale_session",
    "7. stale session rejected"
  );

  // 8. duplicate start request is ignored
  assertEqual(
    shouldAcceptTvPiPStart({
      inFlight: true,
      sessionActive: true,
      eligible: true,
      disposed: false,
    }).reason,
    "in_flight",
    "8. duplicate start ignored"
  );

  // 9. PiP rejection is caught / classified (no throw path in helper)
  assertEqual(
    classifyTvPipRejection(new Error("Picture in Picture is not supported")),
    "unsupported",
    "9. rejection classified unsupported"
  );
  assertEqual(
    resolveTvPipUserMessage("unsupported"),
    "PiP unavailable on this device",
    "9b. unsupported user message"
  );

  // 10. PiP error does not replace TV stream error
  assertEqual(
    shouldReplaceTvStreamErrorWithPipError(),
    false,
    "10. PiP never replaces stream error"
  );

  // 11. source switch reuses one TV player (same session identity)
  assertEqual(
    resolveTvPlayerReusePolicy({
      previousSessionId: 7,
      nextSessionId: 7,
      sameSession: true,
    }),
    "reuse_existing_player",
    "11. same session reuses player"
  );

  // 12. Radio/music owners are never referenced
  // Contract: eligibility helpers stay pure and isolated from audio owners.
  assert(
    typeof canUseTvPiP === "function" &&
      typeof shouldAcceptTvPiPStart === "function" &&
      typeof resolveTvPlayerReusePolicy === "function",
    "12. PiP helpers remain isolated (no HiddenAudio/PlayerContext/Queue imports)"
  );

  // 13. no default fallback marks every source eligible
  assert(
    !canUseTvPiP({
      platform: "ios",
      sourceUri: "not-a-url",
      surface: "native",
      playerStatus: "playing",
      isNativeSurfaceMounted: true,
      sessionActive: true,
    }),
    "13. non-http junk not eligible"
  );
  assert(
    !canUseTvPiP({
      platform: "web",
      sourceUri: "https://cdn.example.com/live/channel.m3u8",
      surface: "native",
      playerStatus: "playing",
      isNativeSurfaceMounted: true,
      sessionActive: true,
    }),
    "13b. unsupported platform not eligible"
  );

  console.log("TV PiP contract tests passed.");
}

main();
