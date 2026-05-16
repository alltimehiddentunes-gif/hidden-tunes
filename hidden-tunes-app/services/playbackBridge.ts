import { AppStateStatus } from "react-native";

export type TrackPlayerSongInput = {
  id: string;
  title: string;
  artist?: string;
  streamUrl?: string;
  url?: string;
  audioUrl?: string;
  audio_url?: string;
  audio?: { uri: string } | number;
  coverUrl?: string;
  artworkUrl?: string;
  thumbnail?: string;
  artwork?: string;
};

export type PlayerRepeatMode = "off" | "one" | "all";

export type PlaybackProgress = {
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
};

export type TrackPlayerEventHandlers = {
  onProgress?: (progress: PlaybackProgress) => void;
  onActiveTrackChanged?: (index: number | null, trackId: string | null) => void;
  onQueueEnded?: () => void;
  onPlaybackError?: (message: string) => void;
};

export function isPlaybackBridgeActive(): boolean {
  return false;
}

export function isNativeQueuePlaybackEnabled(): boolean {
  return false;
}

export async function shouldUseTrackPlayerPlayback(): Promise<boolean> {
  return false;
}

export async function activateTrackPlayerPlayback(
  _options: {
    songs: TrackPlayerSongInput[];
    startIndex: number;
    repeatMode: PlayerRepeatMode;
    volume: number;
    muted: boolean;
    startPositionMillis?: number;
  }
): Promise<number> {
  return 0;
}

export async function deactivateTrackPlayerPlayback(): Promise<void> {
  return;
}

export async function bridgeResetPlayback(): Promise<void> {
  return;
}

export async function bridgeSyncRepeatMode(
  _mode: PlayerRepeatMode
): Promise<void> {
  return;
}

export async function bridgeTogglePlayPause(): Promise<boolean> {
  return false;
}

export async function bridgeSeekTo(_millis: number): Promise<void> {
  return;
}

export async function bridgeSetVolume(
  _volume: number,
  _muted: boolean
): Promise<void> {
  return;
}

export async function bridgeSkipToNext(): Promise<void> {
  return;
}

export async function bridgeSkipToPrevious(): Promise<void> {
  return;
}

export async function bridgeGetProgress(): Promise<PlaybackProgress> {
  return {
    positionMillis: 0,
    durationMillis: 0,
    isPlaying: false,
  };
}

export async function bridgeGetActiveIndex(): Promise<number | null> {
  return null;
}

export function subscribeBridgeEvents(
  _handlers: TrackPlayerEventHandlers
): () => void {
  return () => {};
}

export async function bridgeSetProgressInterval(
  _appState: AppStateStatus
): Promise<void> {
  return;
}
