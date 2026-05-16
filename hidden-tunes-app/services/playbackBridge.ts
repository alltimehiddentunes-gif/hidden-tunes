import { AppState, AppStateStatus } from "react-native";
import TrackPlayer from "react-native-track-player";

import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";

import {
  ensureTrackPlayerReady,
  getTrackPlayerActiveIndex,
  getTrackPlayerProgress,
  isTrackPlayerRuntimeAvailable,
  playTrackPlayerQueue,
  resetTrackPlayerPlayback,
  setTrackPlayerRepeatMode,
  subscribeTrackPlayerEvents,
  trackPlayerSeekTo,
  trackPlayerSetVolume,
  trackPlayerSkipToNext,
  trackPlayerSkipToPrevious,
  trackPlayerTogglePlayPause,
  type PlaybackProgress,
  type PlayerRepeatMode,
  type TrackPlayerEventHandlers,
  type TrackPlayerSongInput,
} from "./trackPlayerEngine";

export type {
  PlaybackProgress,
  PlayerRepeatMode,
  TrackPlayerEventHandlers,
  TrackPlayerSongInput,
};

let bridgeActive = false;

export function isPlaybackBridgeActive(): boolean {
  return bridgeActive;
}

export function isNativeQueuePlaybackEnabled(): boolean {
  return isTrackPlayerRuntimeAvailable();
}

export async function shouldUseTrackPlayerPlayback(): Promise<boolean> {
  if (!isTrackPlayerFeatureEnabled()) return false;
  return ensureTrackPlayerReady();
}

export async function activateTrackPlayerPlayback(
  options: Parameters<typeof playTrackPlayerQueue>[0]
): Promise<number> {
  const index = await playTrackPlayerQueue(options);
  bridgeActive = true;
  return index;
}

export async function deactivateTrackPlayerPlayback(): Promise<void> {
  bridgeActive = false;
  await resetTrackPlayerPlayback();
}

export async function bridgeResetPlayback(): Promise<void> {
  if (!bridgeActive) return;
  await deactivateTrackPlayerPlayback();
}

export async function bridgeSyncRepeatMode(mode: PlayerRepeatMode): Promise<void> {
  if (!bridgeActive) return;
  await setTrackPlayerRepeatMode(mode);
}

export async function bridgeTogglePlayPause(): Promise<boolean> {
  return trackPlayerTogglePlayPause();
}

export async function bridgeSeekTo(millis: number): Promise<void> {
  await trackPlayerSeekTo(millis);
}

export async function bridgeSetVolume(
  volume: number,
  muted: boolean
): Promise<void> {
  await trackPlayerSetVolume(volume, muted);
}

export async function bridgeSkipToNext(): Promise<void> {
  await trackPlayerSkipToNext();
}

export async function bridgeSkipToPrevious(): Promise<void> {
  await trackPlayerSkipToPrevious();
}

export async function bridgeGetProgress(): Promise<PlaybackProgress> {
  return getTrackPlayerProgress();
}

export { getTrackPlayerActiveIndex as bridgeGetActiveIndex };

export function subscribeBridgeEvents(
  handlers: TrackPlayerEventHandlers
): () => void {
  return subscribeTrackPlayerEvents(handlers);
}

export async function bridgeSetProgressInterval(
  appState: AppStateStatus
): Promise<void> {
  if (!bridgeActive) return;

  const isBackground =
    appState === "background" || appState === "inactive";

  try {
    await TrackPlayer.updateOptions({
      progressUpdateEventInterval: isBackground ? 0.5 : 1,
    });
  } catch (error) {
    console.log("TrackPlayer progress interval error:", error);
  }
}
