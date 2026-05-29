import { Platform } from "react-native";

/**
 * Native queue playback via react-native-track-player.
 *
 * WORKS IN: EAS preview/production + Development Client (Android; iOS when enabled below).
 * NEVER IN: Expo Go — RNTP is not bundled there; expo-av handles playback.
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
export const USE_NATIVE_TRACK_PLAYER_ON_IOS = true;

/**
 * Proof-of-concept only: opt iOS into a narrow RNTP playback path.
 * Keep false to preserve the current expo-av-only iOS behavior.
 */
export const USE_IOS_RNTP_POC = false;

/**
 * B1.1 reliability instrumentation (main-thread only).
 * Disabled after lock-screen regression — do not call native Track Player
 * APIs from background/remote event handlers.
 */
export const ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS = false;

export function isTrackPlayerFeatureEnabled(): boolean {
  if (!USE_NATIVE_TRACK_PLAYER) return false;
  if (
    Platform.OS === "ios" &&
    !USE_NATIVE_TRACK_PLAYER_ON_IOS &&
    !USE_IOS_RNTP_POC
  ) {
    return false;
  }
  return true;
}

export function isIosRntpPocEnabled(): boolean {
  return Platform.OS === "ios" && USE_IOS_RNTP_POC;
}

export function isPlaybackReliabilityDiagnosticsEnabled(): boolean {
  return ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS;
}
