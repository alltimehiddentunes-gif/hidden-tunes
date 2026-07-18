/**
 * Provider-agnostic concert media candidate.
 * YouTube is one provider among many — not the system centre.
 */

export type ConcertPlaybackMethod =
  | "youtube_embed"
  | "vimeo_embed"
  | "dailymotion_embed"
  | "twitch_embed"
  | "hls"
  | "dash"
  | "iframe_player"
  | "official_player"
  | "unsupported";

export type ConcertMediaProviderId =
  | "youtube"
  | "vimeo"
  | "dailymotion"
  | "twitch"
  | "hls"
  | "dash"
  | "iframe"
  | "official_website"
  | "public_broadcaster_player"
  | "festival_player"
  | "venue_player"
  | "authorized_platform"
  | "other";

export type ConcertMediaCandidate = {
  provider: ConcertMediaProviderId;
  providerContentId: string;
  title: string;
  description: string;
  channelId: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  tags: string[];
  liveBroadcastContent: "none" | "upcoming" | "live" | "completed" | string;
  embeddable: boolean | null;
  regionRestriction: {
    allowed?: string[];
    blocked?: string[];
  };
  officialWatchUrl: string;
  embedUrl: string | null;
  streamUrl: string | null;
  playbackMethod: ConcertPlaybackMethod;
  languageCode: string | null;
  countryCode: string | null;
  sourceStableKey?: string | null;
  raw?: Record<string, unknown>;
};

export function toConcertMediaCandidate(
  partial: Partial<ConcertMediaCandidate> &
    Pick<
      ConcertMediaCandidate,
      "provider" | "providerContentId" | "title" | "officialWatchUrl" | "playbackMethod"
    >
): ConcertMediaCandidate {
  return {
    description: "",
    channelId: null,
    channelTitle: null,
    publishedAt: null,
    durationSeconds: null,
    thumbnailUrl: null,
    tags: [],
    liveBroadcastContent: "none",
    embeddable: null,
    regionRestriction: {},
    embedUrl: null,
    streamUrl: null,
    languageCode: null,
    countryCode: null,
    sourceStableKey: null,
    ...partial,
  };
}
