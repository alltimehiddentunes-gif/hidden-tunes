export type HiddenTunesSource =
  | "youtube"
  | "audius"
  | "archive"
  | "cloudflare"
  | "local";

export type HiddenTunesMusicType =
  | "song"
  | "album"
  | "artist"
  | "playlist";

export type HiddenTunesTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork: string;
  duration?: string;

  source: HiddenTunesSource;
  type: HiddenTunesMusicType;

  videoId?: string;
  streamUrl?: string;
  url?: string;

  channelTitle?: string;
  thumbnail?: string;

  isOnline: boolean;
};

export type EmotionalMetadataRaw = {
  energy?: number | null;
  tempoBpm?: number | null;
  atmosphere?: string | null;
  emotion?: string | null;
  texture?: string | null;
  timeOfDay?: string | null;
  vocalFeel?: string | null;
  instrumentation?: string | null;
  analysisStatus?: string | null;
  analysisSource?: string | null;
};

export type EmotionalVector = {
  energy: number;
  warmth: number;
  darkness: number;
  intimacy: number;
  nostalgia: number;
  aggression: number;
};

export type Track = HiddenTunesTrack & {
  emotionalMetadataRaw?: EmotionalMetadataRaw | null;
  emotionalVector?: EmotionalVector | null;
  emotionalTags?: string[];
};

export type QueryContext = {
  text?: string;
  moodTags?: string[];
  world?: string;
  currentTrack?: Track;
};
