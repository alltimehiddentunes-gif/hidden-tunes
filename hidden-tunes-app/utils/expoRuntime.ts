import Constants, { ExecutionEnvironment } from "expo-constants";
import { NativeModules, Platform } from "react-native";

import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";

/**
 * Expo runtime detection (Android + iOS).
 *
 * INSTANT RELOAD — enough for:
 * - JS/TS/React components, styles, assets
 * - `USE_NATIVE_TRACK_PLAYER` flag toggles
 * - Player UI (MiniPlayer, screens) without native changes
 * Command: `npm run start:dev-client:tunnel` (remote tunnel default)
 *
 * REBUILD REQUIRED — run both platforms when native config changes:
 * - `npm run build:dev-client:android`
 * - `npm run build:dev-client:ios`
 * Triggers: app.json plugins, permissions, icons, native module upgrades
 * (expo-dev-client, react-native-track-player, expo-media-control, etc.)
 *
 * EXPO GO (Android + iPhone):
 * - Never loads react-native-track-player (crashes / unsupported).
 * - Playback requires HiddenAudio in custom builds; lock-screen native queue is NOT testable.
 * - Use only for quick UI checks, not playback QA.
 */

/** True in the public Expo Go app on Android or iPhone. */
export function isExpoGo(): boolean {
  if (Constants.appOwnership === "expo") {
    return true;
  }

  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** True in a custom Development Client build (EAS developmentClient profile). */
export function isDevelopmentClient(): boolean {
  if (isExpoGo()) {
    return false;
  }

  const nativeModules = NativeModules as Record<string, unknown>;

  return Boolean(nativeModules.EXDevLauncher || nativeModules.EXDevMenu);
}

/** Native modules from custom dev/release builds (both platforms). */
export function supportsNativeModules(): boolean {
  return !isExpoGo();
}

/**
 * react-native-track-player is lazy-loaded only when this is true.
 * False in Expo Go on Android and iOS — prevents RNTP init entirely.
 */
export function supportsNativeTrackPlayer(): boolean {
  return supportsNativeModules() && isTrackPlayerFeatureEnabled();
}

/** Safe to register Track Player playback service from index.js. */
export function canRegisterTrackPlayerPlaybackService(): boolean {
  return supportsNativeTrackPlayer();
}

export function getExpoRuntimeLabel():
  | "expo-go"
  | "development-client"
  | "standalone" {
  if (isExpoGo()) return "expo-go";
  if (isDevelopmentClient()) return "development-client";
  return "standalone";
}

export function getPlatformRuntimeLabel(): string {
  return Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : Platform.OS;
}
