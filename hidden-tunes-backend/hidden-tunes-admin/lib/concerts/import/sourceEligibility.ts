/**
 * Source import eligibility under the corrected Phase 4 rule:
 * Official/authorized + free + can evaluate items + in-app player path exists.
 */

import {
  isEnableableConcertAuthorization,
  isImportableConcertEmbedPolicy,
} from "../sourceAuthorization";
import type { ConcertSourceSeed } from "../types";

export function isConcertSourceImportEligible(source: ConcertSourceSeed): boolean {
  if (!source.enabled) return false;
  if (!isEnableableConcertAuthorization(source.authorizationBasis)) return false;
  if (!isImportableConcertEmbedPolicy(source.embedPolicy)) return false;
  if (source.embedPolicy === "external_link_only") return false;
  if (source.authorizationBasis === "unclear" || source.authorizationBasis === "denied") {
    return false;
  }
  // Subscription platforms stay discovery-only until free playable path exists.
  if (
    source.provider === "authorized_platform" &&
    source.geoRestrictions &&
    (source.geoRestrictions as { subscription?: boolean }).subscription
  ) {
    return false;
  }
  return source.provider === "youtube" || source.provider === "public_broadcaster_player";
}

export function withPhase4ImportFlags(source: ConcertSourceSeed): ConcertSourceSeed {
  const importEnabled = isConcertSourceImportEligible(source);
  return {
    ...source,
    importEnabled,
  };
}
