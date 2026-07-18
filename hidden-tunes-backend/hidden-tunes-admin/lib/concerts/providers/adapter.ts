/**
 * Concert provider adapter contract.
 * Discovery / metadata / playback resolution / validation hooks.
 * Providers need not expose identical fields.
 */

import type {
  ConcertMediaCandidate,
  ConcertMediaProviderId,
  ConcertPlaybackMethod,
} from "../candidate";

export type ConcertPlaybackResolution = {
  method: ConcertPlaybackMethod;
  embedUrl: string | null;
  streamUrl: string | null;
  watchUrl: string | null;
  appCompatible: boolean;
  reason: string;
};

export type ConcertProviderAdapter = {
  id: ConcertMediaProviderId;
  supportsDiscovery: boolean;
  detect(urlOrId: string): boolean;
  normalizeContentId(urlOrId: string): string | null;
  resolvePlayback(input: {
    contentId?: string | null;
    watchUrl?: string | null;
    embedUrl?: string | null;
    streamUrl?: string | null;
  }): ConcertPlaybackResolution;
  /** Optional metadata fetch — adapters may return null when APIs unavailable. */
  fetchCandidate?(input: {
    contentId: string;
    signal?: AbortSignal;
  }): Promise<ConcertMediaCandidate | null>;
};

export function detectProviderFromUrl(url: string): ConcertMediaProviderId | null {
  const raw = String(url || "").trim().toLowerCase();
  if (!raw) return null;
  if (/youtube\.com|youtu\.be/.test(raw)) return "youtube";
  if (/vimeo\.com|player\.vimeo\.com/.test(raw)) return "vimeo";
  if (/dailymotion\.com|dai\.ly/.test(raw)) return "dailymotion";
  if (/twitch\.tv|player\.twitch\.tv/.test(raw)) return "twitch";
  if (/\.m3u8(\?|$)/.test(raw)) return "hls";
  if (/\.mpd(\?|$)/.test(raw)) return "dash";
  if (/^https?:\/\//.test(raw)) return "iframe";
  return null;
}
