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

export function songToTrack(_song: TrackPlayerSongInput): null {
  return null;
}

export function isTrackPlayerRuntimeAvailable(): boolean {
  return false;
}

export async function ensureTrackPlayerReady(): Promise<boolean> {
  return false;
}

export async function resetTrackPlayerPlayback(): Promise<void> {
  return;
}

export async function playTrackPlayerQueue(options: {
  songs: TrackPlayerSongInput[];
  startIndex: number;
  repeatMode: PlayerRepeatMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
}): Promise<number> {
  return Math.max(0, options.startIndex);
}

export async function setTrackPlayerRepeatMode(
  _mode: PlayerRepeatMode
): Promise<void> {
  return;
}

export async function getTrackPlayerProgress(): Promise<PlaybackProgress> {
  return {
    positionMillis: 0,
    durationMillis: 0,
    isPlaying: false,
  };
}

export async function getTrackPlayerActiveIndex(): Promise<number | null> {
  return null;
}

export async function trackPlayerTogglePlayPause(): Promise<boolean> {
  return false;
}

export async function trackPlayerSeekTo(_millis: number): Promise<void> {
  return;
}

export async function trackPlayerSetVolume(
  _volume: number,
  _muted: boolean
): Promise<void> {
  return;
}

export async function trackPlayerSkipToNext(): Promise<void> {
  return;
}

export async function trackPlayerSkipToPrevious(): Promise<void> {
  return;
}

export type TrackPlayerEventHandlers = {
  onProgress?: (progress: PlaybackProgress) => void;
  onActiveTrackChanged?: (index: number | null, trackId: string | null) => void;
  onQueueEnded?: () => void;
  onPlaybackError?: (message: string) => void;
};

export function subscribeTrackPlayerEvents(
  _handlers: TrackPlayerEventHandlers
): () => void {
  return () => {};
}
