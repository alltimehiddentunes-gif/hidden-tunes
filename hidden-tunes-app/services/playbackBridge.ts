import { AppStateStatus } from "react-native";

import { isTrackPlayerFeatureEnabled } from "../constants/playbackConfig";
import { supportsNativeTrackPlayer } from "../utils/expoRuntime";
import {
  PlaybackEngineEventHandlers,
  PlaybackEngineProgress,
  PlaybackEngineRepeatMode,
  PlaybackEngineTrack,
} from "./playbackEngineTypes";
import {
  ensureTrackPlayerReady,
  getTrackPlayerActiveIndex,
  getTrackPlayerProgress,
  playTrackPlayerQueue,
  resetTrackPlayerPlayback,
  setTrackPlayerRepeatMode,
  subscribeTrackPlayerEvents,
  trackPlayerPause,
  trackPlayerPlay,
  trackPlayerSeekTo,
  trackPlayerSetVolume,
  trackPlayerSkipToNext,
  trackPlayerSkipToPrevious,
  trackPlayerTogglePlayPause,
  updateTrackPlayerProgressInterval,
} from "./trackPlayerEngine";

export type TrackPlayerSongInput = PlaybackEngineTrack;
export type PlayerRepeatMode = PlaybackEngineRepeatMode;
export type PlaybackProgress = PlaybackEngineProgress;
export type TrackPlayerEventHandlers = PlaybackEngineEventHandlers;

let bridgeActive = false;

export function isPlaybackBridgeActive(): boolean {
  return bridgeActive && isTrackPlayerFeatureEnabled();
}

export function isNativeQueuePlaybackEnabled(): boolean {
  return isPlaybackBridgeActive();
}

export async function shouldUseTrackPlayerPlayback(): Promise<boolean> {
  if (!isTrackPlayerFeatureEnabled()) return false;
  if (!supportsNativeTrackPlayer()) return false;
  return ensureTrackPlayerReady();
}

export async function activateTrackPlayerPlayback(options: {
  songs: TrackPlayerSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
}): Promise<number> {
  const playedIndex = await playTrackPlayerQueue(options);
  bridgeActive = true;
  return playedIndex;
}

export async function deactivateTrackPlayerPlayback(): Promise<void> {
  bridgeActive = false;
  await resetTrackPlayerPlayback();
}

export async function bridgeResetPlayback(): Promise<void> {
  await deactivateTrackPlayerPlayback();
}

export async function bridgeSyncRepeatMode(
  mode: PlayerRepeatMode
): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await setTrackPlayerRepeatMode(mode);
}

export async function bridgeTogglePlayPause(): Promise<boolean> {
  if (!isPlaybackBridgeActive()) return false;
  return trackPlayerTogglePlayPause();
}

export async function bridgeSeekTo(millis: number): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSeekTo(millis);
}

export async function bridgeSetVolume(
  volume: number,
  muted: boolean
): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSetVolume(volume, muted);
}

export async function bridgeSkipToNext(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSkipToNext();
}

export async function bridgeSkipToPrevious(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerSkipToPrevious();
}

export async function bridgeGetProgress(): Promise<PlaybackProgress> {
  if (!isPlaybackBridgeActive()) {
    return {
      positionMillis: 0,
      durationMillis: 0,
      isPlaying: false,
    };
  }

  return getTrackPlayerProgress();
}

export async function bridgeGetActiveIndex(): Promise<number | null> {
  if (!isPlaybackBridgeActive()) return null;
  return getTrackPlayerActiveIndex();
}

export function subscribeBridgeEvents(
  handlers: TrackPlayerEventHandlers
): () => void {
  if (!isTrackPlayerFeatureEnabled() || !supportsNativeTrackPlayer()) {
    return () => {};
  }

  return subscribeTrackPlayerEvents(handlers);
}

export async function bridgeSetProgressInterval(
  appState: AppStateStatus
): Promise<void> {
  if (!isTrackPlayerFeatureEnabled()) return;

  const intervalSeconds = appState === "active" ? 0.5 : 1;
  await updateTrackPlayerProgressInterval(intervalSeconds);
}

export async function bridgePlay(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerPlay();
}

export async function bridgePause(): Promise<void> {
  if (!isPlaybackBridgeActive()) return;
  await trackPlayerPause();
}
