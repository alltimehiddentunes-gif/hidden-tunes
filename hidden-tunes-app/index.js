try {
  const TrackPlayer = require("react-native-track-player").default;

  TrackPlayer.registerPlaybackService(() =>
    require("./services/playbackServiceRegistration")
  );
} catch {
  // Expo Go and web builds use expo-av playback only.
}

require("expo-router/entry");
