import { Platform } from "react-native";

/**
 * Native queue playback via react-native-track-player.
 *
 * WORKS IN: EAS preview/production + Development Client (Android; iOS when enabled below).
 * NEVER IN: Expo Go — RNTP is not bundled there; expo-av fallback only.
 *
 * DAILY ANDROID TESTING: use preview APK (`npm run build:preview:android`) — no Metro.
 * DEV CLIENT + METRO: only when debugging native modules or instant reload.
 *
 * INSTANT RELOAD (no rebuild):
 * - Set this flag true/false and reload Metro (`npm run start:dev-client:tunnel`).
 *
 * REBUILD preview or developmentClient when:
 * - Upgrading react-native-track-player
 * - Changing app.json native plugins or background audio permissions
 */
export const USE_NATIVE_TRACK_PLAYER = true;

/**
 * iOS uses expo-av until RNTP lock-screen playback is stable on preview builds.
 * Android keeps USE_NATIVE_TRACK_PLAYER. Set true to re-test RNTP on iOS.
 */
export const USE_NATIVE_TRACK_PLAYER_ON_IOS = false;

/**
 * iOS native hidden_audio engine (AVPlayer + Now Playing POC).
 * When false, iOS uses expo-av — identical to current production.
 * When true on iOS only, PlayerContext routes playback through hidden_audio.
 */
export const USE_NATIVE_HIDDEN_AUDIO_ON_IOS = true;

/**
 * B1.1 reliability instrumentation (main-thread only).
 * Disabled after lock-screen regression — do not call native Track Player
 * APIs from background/remote event handlers.
 */
export const ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS = false;

/**
 * Hidden Audio native POC — when true:
 * - Cold start opens /hidden-audio-test (skips tabs)
 * - RNTP playback service is not registered at app entry
 *
 * Legacy app behavior is unchanged while this flag is false.
 */
export const HIDDEN_AUDIO_POC_STARTUP_ENABLED = false;

export const HIDDEN_AUDIO_POC_ROUTE = "/hidden-audio-test";

export function isHiddenAudioPocStartupEnabled(): boolean {
  return HIDDEN_AUDIO_POC_STARTUP_ENABLED;
}

export function shouldSkipLegacyPlaybackRegistration(): boolean {
  return HIDDEN_AUDIO_POC_STARTUP_ENABLED;
}

export function isHiddenAudioPocRoute(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";

  if (normalizedPath === HIDDEN_AUDIO_POC_ROUTE) {
    return true;
  }

  if (HIDDEN_AUDIO_POC_STARTUP_ENABLED && normalizedPath === "/") {
    return true;
  }

  return false;
}

export function isTrackPlayerFeatureEnabled(): boolean {
  if (!USE_NATIVE_TRACK_PLAYER) return false;
  if (Platform.OS === "ios" && !USE_NATIVE_TRACK_PLAYER_ON_IOS) return false;
  return true;
}

export function isHiddenAudioEnabledOnIOS(): boolean {
  return Platform.OS === "ios" && USE_NATIVE_HIDDEN_AUDIO_ON_IOS;
}

export function isPlaybackReliabilityDiagnosticsEnabled(): boolean {
  return ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS;
}
