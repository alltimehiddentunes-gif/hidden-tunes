/**
 * Worldwide official-source classification.
 * Discovery is broad; in-app Watch Live remains evidence-gated.
 */

export const SOURCE_CLASSIFICATIONS = [
  "approved_direct",
  "approved_embed",
  "approved_external",
  "approved_metadata_only",
  "subscription_required",
  "geo_restricted",
  "needs_review",
  "rejected_unofficial",
  "rejected_duplicate",
  "rejected_dead",
  "rejected_rights_unknown",
] as const;

export type SourceClassification = (typeof SOURCE_CLASSIFICATIONS)[number];

export const SOURCE_FAMILIES = [
  "international_governing_body",
  "continental_confederation",
  "national_federation",
  "professional_league",
  "semi_pro_league",
  "lower_division",
  "youth_competition",
  "womens_competition",
  "university_college",
  "school_academy",
  "official_club",
  "tournament_organizer",
  "event_promoter",
  "olympic_parasport",
  "public_service_broadcaster",
  "free_to_air_broadcaster",
  "official_sports_network",
  "municipal_regional",
  "official_streaming_platform",
  "youtube_official",
  "twitch_official",
  "federation_ott",
  "event_microsite",
  "venue_stream",
  "timing_scoring_platform",
  "motorsport_series",
  "combat_promotion",
  "esports_organizer",
  "adaptive_sport_body",
  "niche_federation",
] as const;

export type SourceFamily = (typeof SOURCE_FAMILIES)[number];

export const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
] as const;

export type Continent = (typeof CONTINENTS)[number];

export type OfficialSourceCandidate = {
  id: string;
  organization: string;
  family: SourceFamily;
  continent: Continent | "Global";
  countryCode: string | null;
  sports: string[];
  platform: string;
  officialDomain: string | null;
  officialChannelId: string | null;
  officialUrl: string | null;
  languages: string[];
  viewerCountries: string[];
  geoRestrictionsKnown: boolean;
  classification: SourceClassification;
  playbackMethod:
    | "unknown"
    | "youtube_embed"
    | "official_embed"
    | "external_ott"
    | "external_web"
    | "direct_stream"
    | "metadata_only";
  commercialAppUse: boolean;
  embeddingAllowed: boolean;
  externalLinkAllowed: boolean;
  subscriptionRequired: boolean;
  discoverySource: string;
  evidenceNote: string;
  active: boolean;
};

/** In-app live only when explicitly approved for embed/direct. */
export function classificationAllowsLiveInApp(
  c: SourceClassification
): boolean {
  return c === "approved_embed" || c === "approved_direct";
}

export function classificationAllowsExternalWatch(
  c: SourceClassification
): boolean {
  return c === "approved_external" || c === "subscription_required";
}

export function classificationAllowsFixtureMetadata(
  c: SourceClassification
): boolean {
  return (
    c !== "rejected_unofficial" &&
    c !== "rejected_duplicate" &&
    c !== "rejected_dead"
  );
}
