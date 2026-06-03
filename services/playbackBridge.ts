import { AppStateStatus } from "react-native";

import { isHiddenAudioEnabledOnIOS } from "../constants/playbackConfig";
import {
  hiddenAudioBridge,
  isHiddenAudioNativeEngineAvailable,
  subscribeHiddenAudioPlaybackEnded,
  type HiddenAudioPlaybackEndedEvent,
} from "../src/hidden-audio/hiddenAudioBridge";
import { recordBridgeSetProgressInterval } from "../utils/runtimeInstrumentation";
import { logBackgroundPlayback } from "../utils/backgroundPlaybackLogs";
import {
  PlaybackEngineEventHandlers,
  PlaybackEngineProgress,
  PlaybackEngineRepeatMode,
  PlaybackEngineTrack,
} from "./playbackEngineTypes";

export type NativeQueueSongInput = PlaybackEngineTrack;
export type PlayerRepeatMode = PlaybackEngineRepeatMode;
export type PlaybackProgress = PlaybackEngineProgress;
export type NativeQueueEventHandlers = PlaybackEngineEventHandlers;
export type PlaybackEngineKind = "hidden_audio";
export type HiddenAudioEndedEvent = HiddenAudioPlaybackEndedEvent;

type QueueSnapshot = {
  queueLength: number;
  activeIndex: number | null;
  playbackState: string | null;
  trackIds: string[];
};

let hiddenAudioBridgeActive = false;

function emptyProgress(): PlaybackProgress {
  return {
    positionMillis: 0,
    durationMillis: 0,
    isPlaying: false,
    playbackState: "idle",
  };
}

function emptyQueueSnapshot(): QueueSnapshot {
  return {
    queueLength: 0,
    activeIndex: null,
    playbackState: null,
    trackIds: [],
  };
}

export function isPlaybackBridgeActive(): boolean {
  return isHiddenAudioPlaybackActive();
}

export function isNativeQueuePlaybackEnabled(): boolean {
  return false;
}

export async function shouldUseNativeQueuePlayback(): Promise<boolean> {
  return false;
}

export async function prewarmNativeQueueForStartup(): Promise<boolean> {
  return false;
}

export async function activateNativeQueuePlayback(options: {
  songs: NativeQueueSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
  reason?: string;
}): Promise<number> {
  return Math.max(0, options.startIndex || 0);
}

export async function bridgePlayQueueFromIndex(options: {
  songs: NativeQueueSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
  reason?: string;
}): Promise<number> {
  return Math.max(0, options.startIndex || 0);
}

export async function bridgeTrySkipToNext(): Promise<boolean> {
  return false;
}

export async function deactivateNativeQueuePlayback(
  reason = "unknown"
): Promise<void> {
  logBackgroundPlayback("native_queue_deactivate_noop", { reason });
}

export async function bridgeResetPlayback(reason = "unknown"): Promise<void> {
  if (isHiddenAudioPlaybackActive()) {
    await deactivateHiddenAudioPlayback(reason);
  }
}

export async function bridgeSyncRepeatMode(
  _mode: PlayerRepeatMode
): Promise<void> {}

export async function bridgeTogglePlayPause(): Promise<boolean> {
  if (!isHiddenAudioPlaybackActive()) return false;

  const status = await hiddenAudioBridge.getStatus();

  if (status.isPlaying) {
    await hiddenAudioBridge.pause();
    return false;
  }

  await hiddenAudioBridge.play();
  return true;
}

export async function bridgeSeekTo(millis: number): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.seek(millis);
}

export async function bridgeSetVolume(
  _volume: number,
  _muted: boolean
): Promise<void> {}

export async function bridgeSkipToNext(): Promise<void> {}

export async function bridgeSkipToPrevious(): Promise<void> {}

export async function bridgeGetProgress(): Promise<PlaybackProgress> {
  if (isHiddenAudioPlaybackActive()) {
    return hiddenAudioBridge.getStatus();
  }

  return emptyProgress();
}

export async function bridgeGetActiveIndex(): Promise<number | null> {
  return null;
}

export async function bridgeGetQueueSnapshot(): Promise<QueueSnapshot> {
  return emptyQueueSnapshot();
}

export function subscribeBridgeEvents(
  _handlers: NativeQueueEventHandlers
): () => void {
  return () => {};
}

export function subscribeHiddenAudioEnded(
  handler: (event: HiddenAudioEndedEvent) => void
): () => void {
  if (!isHiddenAudioEnabledOnIOS()) return () => {};
  return subscribeHiddenAudioPlaybackEnded(handler);
}

export async function bridgeSetProgressInterval(
  appState: AppStateStatus
): Promise<void> {
  recordBridgeSetProgressInterval(appState, 0);
}

export async function bridgePlay(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.play();
}

export async function bridgePause(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.pause();
}

export async function bridgeInterruptForUserTap(): Promise<void> {}

export async function bridgeTryUserTapFastPlay(_options: {
  songs: NativeQueueSongInput[];
  songId: string;
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
}): Promise<{ playedIndex: number } | null> {
  return null;
}

export function isHiddenAudioPlaybackActive(): boolean {
  return hiddenAudioBridgeActive && isHiddenAudioEnabledOnIOS();
}

export async function shouldUseHiddenAudioPlayback(): Promise<boolean> {
  if (!isHiddenAudioEnabledOnIOS()) return false;
  return isHiddenAudioNativeEngineAvailable();
}

export async function activateHiddenAudioPlayback(options: {
  url: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  positionSeconds?: number;
  artworkUrl?: string;
}): Promise<void> {
  await hiddenAudioBridge.updateNowPlaying({
    title: options.title,
    artist: options.artist,
    album: options.album || "",
    duration: options.durationSeconds ?? 0,
    position: options.positionSeconds ?? 0,
    artworkUrl: options.artworkUrl || "",
  });
  await hiddenAudioBridge.load(options.url);

  const startPositionMs = Math.max(0, Math.round((options.positionSeconds ?? 0) * 1000));
  if (startPositionMs > 0) {
    await hiddenAudioBridge.seek(startPositionMs);
  }

  await hiddenAudioBridge.play();
  hiddenAudioBridgeActive = true;
}

export async function deactivateHiddenAudioPlayback(
  reason = "unknown"
): Promise<void> {
  if (!hiddenAudioBridgeActive) return;

  logBackgroundPlayback("hidden_audio_deactivate_requested", { reason });

  try {
    await hiddenAudioBridge.stop();
  } catch (error) {
    console.log("[hidden_audio] deactivate error:", error);
  }

  hiddenAudioBridgeActive = false;
}

export async function bridgeHiddenAudioPlay(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.play();
}

export async function bridgeHiddenAudioPause(): Promise<void> {
  if (!isHiddenAudioPlaybackActive()) return;
  await hiddenAudioBridge.pause();
}

export async function bridgeHiddenAudioUpdateNowPlaying(options: {
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  positionSeconds?: number;
  artworkUrl?: string;
}): Promise<void> {
  if (!isHiddenAudioEnabledOnIOS()) return;

  await hiddenAudioBridge.updateNowPlaying({
    title: options.title,
    artist: options.artist,
    album: options.album || "",
    duration: options.durationSeconds ?? 0,
    position: options.positionSeconds ?? 0,
    artworkUrl: options.artworkUrl || "",
  });
}