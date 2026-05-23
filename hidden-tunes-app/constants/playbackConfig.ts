/**
 * Native queue playback via react-native-track-player.
 * Requires a dev/EAS build (not Expo Go). Set to true to test lock-screen auto-next.
 */
export const USE_NATIVE_TRACK_PLAYER = true;

export function isTrackPlayerFeatureEnabled(): boolean {
  return USE_NATIVE_TRACK_PLAYER;
}
