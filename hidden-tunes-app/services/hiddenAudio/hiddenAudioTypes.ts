export type HiddenAudioTrack = {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  durationSeconds?: number;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type HiddenAudioPlaybackStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "buffering"
  | "ended"
  | "stopped"
  | "error";

export type HiddenAudioQueueState = {
  tracks: HiddenAudioTrack[];
  activeIndex: number;
};

export type HiddenAudioState = {
  status: HiddenAudioPlaybackStatus;
  activeTrack: HiddenAudioTrack | null;
  queue: HiddenAudioQueueState;
  error: string | null;
};

export type HiddenAudioProgress = {
  positionSeconds: number;
  durationSeconds: number;
  bufferedSeconds: number;
};

export type HiddenAudioEvent =
  | {
      type: "state";
      state: HiddenAudioState;
    }
  | {
      type: "progress";
      progress: HiddenAudioProgress;
    }
  | {
      type: "track_changed";
      track: HiddenAudioTrack | null;
      index: number;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "diagnostic";
      eventName: string;
      data?: Record<string, string | number | boolean | null | undefined>;
    };

export type HiddenAudioListener = (event: HiddenAudioEvent) => void;

export type HiddenAudioUnsubscribe = () => void;

export type HiddenAudioControllerApi = {
  setup: () => Promise<void>;
  loadTrack: (track: HiddenAudioTrack) => Promise<void>;
  loadQueue: (tracks: HiddenAudioTrack[], startIndex: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  getState: () => Promise<HiddenAudioState>;
  getProgress: () => Promise<HiddenAudioProgress>;
  getActiveTrack: () => Promise<HiddenAudioTrack | null>;
  subscribe: (listener: HiddenAudioListener) => HiddenAudioUnsubscribe;
};
