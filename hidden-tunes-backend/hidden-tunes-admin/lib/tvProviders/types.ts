export type TvPlaybackProvider = "pluto";

export type TvValidationState =
  | "PLAYING_CONTENT"
  | "END_OF_AVAILABILITY"
  | "PLACEHOLDER"
  | "IDLE_SLATE"
  | "WRONG_CHANNEL"
  | "GEO_BLOCKED"
  | "AUTH_REQUIRED"
  | "SESSION_EXPIRED"
  | "DEAD"
  | "UNKNOWN";

export interface ResolveTvPlaybackInput {
  provider: TvPlaybackProvider;
  providerChannelId: string;
  region?: string | null;
}

export interface ResolvedTvPlayback {
  provider: TvPlaybackProvider;
  providerChannelId: string;
  canonicalName: string;
  source: string;
  protocol: "hls";
  headers: Readonly<Record<string, string>>;
  region: string | null;
  provenance: "official_public_pluto_guide";
  confidence: "EXACT";
  resolvedAt: string;
  expiresAt: string;
  validationState: TvValidationState;
}
