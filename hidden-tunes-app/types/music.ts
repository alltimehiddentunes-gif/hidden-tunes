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