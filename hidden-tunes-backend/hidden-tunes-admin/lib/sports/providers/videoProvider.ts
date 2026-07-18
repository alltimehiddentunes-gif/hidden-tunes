/**
 * Sports video provider contract — adapters never write user-facing API responses.
 */

import type { ValidationResult } from "../playback/validateBroadcast";

export type ProviderBroadcast = {
  providerAssetId: string;
  fixtureId: string;
  providerFixtureId?: string;
  title: string;
  broadcastType: "live_match" | "live_event" | "replay" | "highlights" | "external_watch";
  playbackKind: "iframe" | "webview" | "hls" | "dash" | "external";
  publisherName?: string;
  publisherDomain?: string;
  isOfficial?: boolean;
  isEmbeddable?: boolean;
  isFree?: boolean;
  requiresLogin?: boolean;
  requiresSubscription?: boolean;
  mobileSupported?: boolean;
  webSupported?: boolean;
  countryAllowlist?: string[];
  countryBlocklist?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  /** Opaque embed reference for validation — never browse-exposed. */
  embedUrlOrHtml?: string | null;
  officialUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProviderPlaybackSession = {
  providerAssetId: string;
  playbackKind: "iframe" | "webview" | "hls" | "dash";
  /** Short-lived embed or session handle — not a permanent public URL. */
  sessionPayload: string;
  expiresAt: string;
};

export type ProviderHealth = {
  status: "healthy" | "degraded" | "unavailable" | "disabled" | "unknown";
  successRate?: number;
  averageLatencyMs?: number;
  consecutiveFailures?: number;
  details?: Record<string, unknown>;
};

export interface SportsVideoProvider {
  providerId: string;

  discoverLiveBroadcasts(input: {
    fixtureId: string;
    providerFixtureId?: string;
  }): Promise<ProviderBroadcast[]>;

  validatePlayback(input: {
    providerAssetId: string;
    fixtureId: string;
    countryCode?: string;
    platform: "ios" | "android" | "web";
  }): Promise<ValidationResult>;

  createPlaybackSession(input: {
    providerAssetId: string;
    fixtureId: string;
    countryCode?: string;
    platform: "ios" | "android" | "web";
  }): Promise<ProviderPlaybackSession>;

  healthCheck(): Promise<ProviderHealth>;
}
