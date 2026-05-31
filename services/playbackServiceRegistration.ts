import { registerTrackPlayerRemoteHandlers } from "./trackPlayerRemoteHandlers";
import { registerTrackPlayerServiceDiagnostics } from "./trackPlayerBackgroundDiagnostics";
import { recordRemoteHandlersAttached } from "../utils/runtimeInstrumentation";

/**
 * Headless playback service (Android MusicService / iOS background audio).
 * Must not gate on Expo Go — this bundle runs outside the main app context.
 */
export default async function PlaybackService() {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[HiddenTunes:TrackPlayer] playback service starting");
  }

  try {
    const remoteHandlers = registerTrackPlayerRemoteHandlers("playback_service");
    recordRemoteHandlersAttached("playback_service", remoteHandlers.length);
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
