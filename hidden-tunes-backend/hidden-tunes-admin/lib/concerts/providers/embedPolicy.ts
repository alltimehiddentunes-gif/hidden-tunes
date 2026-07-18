import type { ConcertEmbedPolicy } from "./types";

export type ConcertEmbedDecision = {
  policy: ConcertEmbedPolicy;
  inAppPlayable: boolean;
  requiresProviderPlayer: boolean;
  externalLinkOnly: boolean;
  importEligible: boolean;
  reason: string;
};

export function decideConcertEmbedPolicy(policy: ConcertEmbedPolicy): ConcertEmbedDecision {
  switch (policy) {
    case "official_embed_allowed":
      return {
        policy,
        inAppPlayable: true,
        requiresProviderPlayer: false,
        externalLinkOnly: false,
        importEligible: true,
        reason: "Official embed is documented as allowed.",
      };
    case "provider_player_required":
      return {
        policy,
        inAppPlayable: true,
        requiresProviderPlayer: true,
        externalLinkOnly: false,
        importEligible: true,
        reason: "Must use the official provider player/embed surface.",
      };
    case "external_link_only":
      return {
        policy,
        inAppPlayable: false,
        requiresProviderPlayer: false,
        externalLinkOnly: true,
        importEligible: false,
        reason: "Discovery/external link only; not in-app playable.",
      };
    case "region_limited":
      return {
        policy,
        inAppPlayable: true,
        requiresProviderPlayer: true,
        externalLinkOnly: false,
        importEligible: true,
        reason: "Embed/player may work only in allowed regions.",
      };
    case "age_restricted":
      return {
        policy,
        inAppPlayable: true,
        requiresProviderPlayer: true,
        externalLinkOnly: false,
        importEligible: true,
        reason: "Provider age gate must be respected; never bypassed.",
      };
    case "unknown":
      return {
        policy,
        inAppPlayable: false,
        requiresProviderPlayer: false,
        externalLinkOnly: false,
        importEligible: false,
        reason: "Embed permission has not been verified.",
      };
    case "prohibited":
      return {
        policy,
        inAppPlayable: false,
        requiresProviderPlayer: false,
        externalLinkOnly: false,
        importEligible: false,
        reason: "Embedding/in-app playback is prohibited.",
      };
    default: {
      const _exhaustive: never = policy;
      return {
        policy: _exhaustive,
        inAppPlayable: false,
        requiresProviderPlayer: false,
        externalLinkOnly: false,
        importEligible: false,
        reason: "Unsupported embed policy.",
      };
    }
  }
}

export function concertEmbedPermittedFlag(policy: ConcertEmbedPolicy): boolean {
  const decision = decideConcertEmbedPolicy(policy);
  return decision.inAppPlayable && decision.importEligible;
}
