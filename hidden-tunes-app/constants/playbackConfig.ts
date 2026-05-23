/**
 * Native queue playback via react-native-track-player.
 *
 * WORKS IN: Development Client + EAS preview/production (Android & iOS).
 * NEVER IN: Expo Go — RNTP is not bundled there; expo-av handles playback.
 *
 * INSTANT RELOAD (no rebuild):
 * - Set this flag true/false and reload Metro (`npm run start:dev-client`).
 *
 * REBUILD developmentClient (Android + iOS) when:
 * - Upgrading react-native-track-player
 * - Changing app.json native plugins or background audio permissions
 */
export const USE_NATIVE_TRACK_PLAYER = true;

export function isTrackPlayerFeatureEnabled(): boolean {
  return USE_NATIVE_TRACK_PLAYER;
}
