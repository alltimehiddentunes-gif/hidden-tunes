/**
 * Source import eligibility — operational rule only:
 * Can this source yield items that may play in-app as concert/live performance?
 *
 * No artificial provider / country / language / channel-ID / pilot-size gates.
 */

import type { ConcertSourceSeed } from "../types";

export function isConcertSourceImportEligible(source: ConcertSourceSeed): boolean {
  if (!source.enabled) return false;
  // Explicitly denied rights or prohibited embeds cannot play in-app.
  if (source.authorizationBasis === "denied") return false;
  if (source.embedPolicy === "prohibited") return false;
  // External-link-only cannot satisfy in-app playback.
  if (source.embedPolicy === "external_link_only") return false;
  // Paid subscription walls with no free in-app player stay out.
  if (
    source.geoRestrictions &&
    (source.geoRestrictions as { subscription?: boolean; paid_only?: boolean })
      .subscription === true &&
    (source.geoRestrictions as { free_playable?: boolean }).free_playable !== true
  ) {
    return false;
  }
  // All other providers (YouTube, Vimeo, Twitch, HLS, broadcasters, etc.) are eligible.
  return true;
}

export function withPhase4ImportFlags(source: ConcertSourceSeed): ConcertSourceSeed {
  const importEnabled = isConcertSourceImportEligible(source);
  return {
    ...source,
    importEnabled,
  };
}

/** Alias for expansion naming — same operational rule. */
export const withConcertImportFlags = withPhase4ImportFlags;
