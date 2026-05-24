import { registerTrackPlayerRemoteHandlers } from "./trackPlayerRemoteHandlers";
import { registerTrackPlayerServiceDiagnostics } from "./trackPlayerBackgroundDiagnostics";

/**
 * Headless playback service (Android MusicService / iOS background audio).
 * Must not gate on Expo Go — this bundle runs outside the main app context.
 */
export default async function PlaybackService() {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[HiddenTunes:TrackPlayer] playback service starting");
  }

  try {
    registerTrackPlayerRemoteHandlers("playback_service");
    registerTrackPlayerServiceDiagnostics();
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "[HiddenTunes:TrackPlayer] playback service registration failed:",
        error
      );
    }
  }
}
