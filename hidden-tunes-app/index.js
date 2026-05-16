const { USE_NATIVE_TRACK_PLAYER } = require("./constants/playbackConfig");

if (USE_NATIVE_TRACK_PLAYER) {
  try {
    const Constants = require("expo-constants").default;
    const isExpoGo = Constants?.appOwnership === "expo";

    if (!isExpoGo) {
      const TrackPlayer = require("react-native-track-player").default;

      TrackPlayer.registerPlaybackService(() =>
        require("./services/playbackServiceRegistration").default
      );
    }
  } catch (error) {
    if (__DEV__) {
      console.warn("Track Player service registration skipped:", error);
    }
  }
}

require("expo-router/entry");
