/**
 * Hidden Tunes entry — Android & iOS
 *
 * DAILY ANDROID TESTING (standalone APK, no Metro):
 *   npm run build:preview:android
 *
 * NATIVE / INSTANT RELOAD (dev client + Metro):
 *   npm run start:dev-client:tunnel
 *   npm run build:dev-client:android  (first time / native changes)
 *
 * EXPO GO (either platform):
 *   Do NOT import or register react-native-track-player.
 *   Expo Go lacks our native binary → HiddenAudio is unavailable.
 *   Lock-screen native auto-next cannot be validated in Expo Go.
 */

require("react-native-gesture-handler");

try {
  const { traceStartup } = require("./utils/startupTrace");
  traceStartup("index.js loaded");
} catch (error) {
  console.log("[HTStartup] STEP 0 index.js trace init failed", String(error));
}

const { isTrackPlayerFeatureEnabled } = require("./constants/playbackConfig");
const {
  canRegisterTrackPlayerPlaybackService,
  getExpoRuntimeLabel,
  getPlatformRuntimeLabel,
  isExpoGo,
} = require("./utils/expoRuntime");

if (__DEV__ && isExpoGo()) {
  console.info(
    `[HiddenTunes][${getPlatformRuntimeLabel()}] Expo Go — Track Player and HiddenAudio unavailable.`
  );
}

let trackPlayerServiceRegistered = false;

if (isTrackPlayerFeatureEnabled() && canRegisterTrackPlayerPlaybackService()) {
  if (!trackPlayerServiceRegistered) {
    try {
      const TrackPlayer = require("react-native-track-player").default;

      TrackPlayer.registerPlaybackService(() =>
        require("./services/playbackServiceRegistration").default
      );

      trackPlayerServiceRegistered = true;

      if (__DEV__) {
        console.info(
          `[HiddenTunes][${getPlatformRuntimeLabel()}] Track Player service registered once (${getExpoRuntimeLabel()}).`
        );
      }
    } catch (error) {
      if (__DEV__) {
        console.warn(
          `[HiddenTunes][${getPlatformRuntimeLabel()}] Track Player registration skipped:`,
          error
        );
      }
    }
  } else if (__DEV__) {
    console.warn(
      `[HiddenTunes][${getPlatformRuntimeLabel()}] Track Player service already registered — skipped duplicate.`
    );
  }
}

try {
  const { traceStartup } = require("./utils/startupTrace");
  traceStartup("expo-router entry loading");
} catch (error) {
  console.log("[HTStartup] STEP pre-entry trace failed", String(error));
}

require("expo-router/entry");
