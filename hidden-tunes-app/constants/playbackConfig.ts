/**
 * Native queue playback via react-native-track-player.
 *
 * WORKS IN: EAS preview/production + Development Client (Android & iOS).
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

/** Dev-only playback reliability instrumentation (no production logs). */
export const ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS =
  typeof __DEV__ !== "undefined" ? __DEV__ : false;

export function isTrackPlayerFeatureEnabled(): boolean {
  return USE_NATIVE_TRACK_PLAYER;
}

export function isPlaybackReliabilityDiagnosticsEnabled(): boolean {
  return ENABLE_PLAYBACK_RELIABILITY_DIAGNOSTICS;
}
