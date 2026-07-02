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

require("expo-router/entry");
