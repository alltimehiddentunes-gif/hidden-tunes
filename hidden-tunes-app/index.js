/**
 * Hidden Tunes entry — Android & iOS
 *
 * DAILY DEV (instant reload, tunnel default):
 *   npm run start:dev-client
 *
 * FIRST-TIME / NATIVE CHANGES (rebuild per platform):
 *   npm run build:dev-client:android
 *   npm run build:dev-client:ios
 *
 * EXPO GO (either platform):
 *   Do NOT import or register react-native-track-player.
 *   Expo Go lacks our native binary → expo-av fallback only.
 *   Lock-screen native auto-next cannot be validated in Expo Go.
 */

const { USE_NATIVE_TRACK_PLAYER } = require("./constants/playbackConfig");
const {
  canRegisterTrackPlayerPlaybackService,
  getExpoRuntimeLabel,
  getPlatformRuntimeLabel,
  isExpoGo,
} = require("./utils/expoRuntime");

if (__DEV__ && isExpoGo()) {
  console.info(
    `[HiddenTunes][${getPlatformRuntimeLabel()}] Expo Go — Track Player disabled; expo-av fallback active.`
  );
}

let trackPlayerServiceRegistered = false;

if (USE_NATIVE_TRACK_PLAYER && canRegisterTrackPlayerPlaybackService()) {
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
