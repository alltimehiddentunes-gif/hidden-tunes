import { AppStateStatus } from "react-native";

export type PlaybackEngineId = "hidden-audio" | "track-player";

export type PlaybackEngineRepeatMode = "off" | "one" | "all";

export type PlaybackEngineQueueMode = "standard" | "radio" | "smart";

export type PlaybackEngineTrack = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  streamUrl?: string;
  url?: string;
  audioUrl?: string;
  audio_url?: string;
  audio?: { uri: string } | number;
  artwork?: string;
  artworkUrl?: string;
  cover?: string;
  coverUrl?: string;
  thumbnail?: string;
  sourceName?: string;
  type?: string;
  duration?: number | string;
  [key: string]: unknown;
};

export type PlaybackEngineProgress = {
  positionMillis: number;
  durationMillis: number;
  isPlaying: boolean;
};

export type PlaybackEngineLoadQueueOptions = {
  tracks: PlaybackEngineTrack[];
  startIndex: number;
  repeatMode: PlaybackEngineRepeatMode;
  queueMode?: PlaybackEngineQueueMode;
  volume: number;
  muted: boolean;
  startPositionMillis?: number;
};

export type PlaybackEngineEventHandlers = {
  onProgress?: (progress: PlaybackEngineProgress) => void;
  onActiveTrackChanged?: (index: number, trackId: string | null) => void;
  onQueueEnded?: () => void;
  onPlaybackError?: (message: string) => void;
};

export type PlaybackEngineCapabilities = {
  ownsNativeQueue: boolean;
  supportsLockScreenAutoNext: boolean;
  supportsRemoteControls: boolean;
  supportsExpoGo: boolean;
};

export type PlaybackEngine = {
  id: PlaybackEngineId;
  capabilities: PlaybackEngineCapabilities;
  isAvailable: () => boolean | Promise<boolean>;
  loadQueue: (options: PlaybackEngineLoadQueueOptions) => Promise<number>;
  reset: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  togglePlayPause: () => Promise<boolean>;
  seekTo: (millis: number) => Promise<void>;
  setVolume: (volume: number, muted: boolean) => Promise<void>;
  setRepeatMode: (mode: PlaybackEngineRepeatMode) => Promise<void>;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  getProgress: () => Promise<PlaybackEngineProgress>;
  getActiveIndex: () => Promise<number | null>;
  setAppState?: (state: AppStateStatus) => Promise<void>;
  subscribe: (handlers: PlaybackEngineEventHandlers) => () => void;
};
