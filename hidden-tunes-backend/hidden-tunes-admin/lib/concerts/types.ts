/**
 * Concerts domain types — Phase 3 source registry.
 * Isolated from TV / Sports / Motivation / Lectures domain modules.
 */

export const CONCERT_PROVIDER_TYPES = [
  "official_artist",
  "official_festival",
  "official_venue",
  "public_broadcaster",
  "orchestra",
  "opera_house",
  "university",
  "conservatory",
  "cultural_institution",
  "government_cultural",
  "authorized_platform",
] as const;

export type ConcertProviderType = (typeof CONCERT_PROVIDER_TYPES)[number];

export const CONCERT_AUTHORIZATION_BASES = [
  "official_owner",
  "explicitly_authorized",
  "institutional_official",
  "platform_permitted",
  "unclear",
  "denied",
] as const;

export type ConcertAuthorizationBasis = (typeof CONCERT_AUTHORIZATION_BASES)[number];

export const CONCERT_ENABLEABLE_AUTHORIZATION = [
  "official_owner",
  "explicitly_authorized",
  "institutional_official",
  "platform_permitted",
] as const;

export const CONCERT_EMBED_POLICIES = [
  "official_embed_allowed",
  "provider_player_required",
  "external_link_only",
  "region_limited",
  "age_restricted",
  "unknown",
  "prohibited",
] as const;

export type ConcertEmbedPolicy = (typeof CONCERT_EMBED_POLICIES)[number];

export const CONCERT_IMPORTABLE_EMBED_POLICIES = [
  "official_embed_allowed",
  "provider_player_required",
  "region_limited",
  "age_restricted",
] as const;

export const CONCERT_MEDIA_PROVIDERS = [
  "youtube",
  "vimeo",
  "dailymotion",
  "twitch",
  "hls",
  "dash",
  "iframe",
  "official_website",
  "authorized_platform",
  "public_broadcaster_player",
  "festival_player",
  "venue_player",
  "other",
] as const;

export type ConcertMediaProvider = (typeof CONCERT_MEDIA_PROVIDERS)[number];

export const CONCERT_EXPECTED_FORMATS = [
  "full_concert",
  "festival_set",
  "livestream",
  "orchestra_performance",
  "opera",
  "recital",
  "venue_broadcast",
  "cultural_performance",
] as const;

export type ConcertExpectedFormat = (typeof CONCERT_EXPECTED_FORMATS)[number];

export type ConcertSourceSeed = {
  stableKey: string;
  name: string;
  providerType: ConcertProviderType;
  provider: ConcertMediaProvider;
  officialUrl: string;
  mediaChannelUrl: string;
  providerChannelId: string | null;
  countryCode: string;
  region: string | null;
  languageCodes: string[];
  sourceOwner: string;
  ownershipEvidenceUrl: string;
  authorizationBasis: ConcertAuthorizationBasis;
  termsUrl: string | null;
  embedPolicy: ConcertEmbedPolicy;
  contentScope: string;
  expectedConcertFormats: ConcertExpectedFormat[];
  supportedCountries: string[];
  geoRestrictions: Record<string, unknown>;
  matureContentPossible: boolean;
  enabled: boolean;
  importEnabled: boolean;
  validationMethod: string;
  reliabilityScore: number;
  lastReviewedAt: string; // YYYY-MM-DD
  reviewNotes: string;
  expectedContentType?: string;
};

export type ConcertSourceRow = {
  id: string;
  stable_key: string;
  name: string;
  provider_type: ConcertProviderType;
  provider: ConcertMediaProvider;
  official_url: string;
  media_channel_url: string | null;
  provider_channel_id: string | null;
  country_code: string | null;
  region: string | null;
  language_code: string | null;
  language_codes: string[];
  source_owner: string;
  ownership_evidence_url: string | null;
  authorization_basis: string;
  terms_url: string | null;
  embed_policy: ConcertEmbedPolicy;
  embed_permitted: boolean;
  content_scope: string | null;
  expected_content_type: string | null;
  expected_concert_formats: string[];
  supported_countries: string[];
  geo_restrictions: Record<string, unknown>;
  mature_content_possible: boolean;
  enabled: boolean;
  import_enabled: boolean;
  validation_method: string | null;
  reliability_score: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_reviewed_at: string | null;
  review_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ConcertRegistryValidationIssue = {
  stableKey?: string;
  field?: string;
  message: string;
};

export type ConcertRegistryValidationResult = {
  ok: boolean;
  errors: ConcertRegistryValidationIssue[];
  warnings: ConcertRegistryValidationIssue[];
};
