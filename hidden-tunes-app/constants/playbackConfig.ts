import Constants from "expo-constants";

/**
 * Native queue playback (react-native-track-player).
 * Requires a dev client / EAS build — not available in Expo Go.
 *
 * Enable via app.json extra.useTrackPlayer or EXPO_PUBLIC_USE_TRACK_PLAYER=true
 */
export function isTrackPlayerFeatureEnabled(): boolean {
  if (process.env.EXPO_PUBLIC_USE_TRACK_PLAYER === "true") {
    return true;
  }

  const extra = Constants.expoConfig?.extra as
    | { useTrackPlayer?: boolean }
    | undefined;

  return extra?.useTrackPlayer === true;
}
