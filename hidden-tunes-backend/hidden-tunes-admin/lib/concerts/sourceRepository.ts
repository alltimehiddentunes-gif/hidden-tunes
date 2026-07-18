/**
 * Concerts source repository — maps Phase 3 registry records onto concert_sources.
 * Uses shared supabaseAdmin only (no TV/Sports/Motivation domain imports).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { concertEmbedPermittedFlag } from "./providers/embedPolicy";
import { normalizeConcertSourceSeed } from "./sourceNormalization";
import type {
  ConcertAuthorizationBasis,
  ConcertEmbedPolicy,
  ConcertSourceRow,
  ConcertSourceSeed,
} from "./types";

const SOURCE_SELECT = `
  id, stable_key, name, provider_type, provider, official_url, media_channel_url,
  provider_channel_id, country_code, region, language_code, language_codes,
  source_owner, ownership_evidence_url, authorization_basis, terms_url, embed_policy,
  embed_permitted, content_scope, expected_content_type, expected_concert_formats,
  supported_countries, geo_restrictions, mature_content_possible, enabled, import_enabled,
  validation_method, reliability_score, last_success_at, last_failure_at,
  last_reviewed_at, review_notes, notes, created_at, updated_at
`.replace(/\s+/g, " ");

export function mapConcertSourceSeedToRow(
  source: ConcertSourceSeed
): Record<string, unknown> {
  const normalized = normalizeConcertSourceSeed(source);
  return {
    stable_key: normalized.stableKey,
    name: normalized.name,
    provider_type: normalized.providerType,
    provider: normalized.provider,
    official_url: normalized.officialUrl,
    media_channel_url: normalized.mediaChannelUrl,
    provider_channel_id: normalized.providerChannelId,
    country_code: normalized.countryCode,
    region: normalized.region,
    language_code: normalized.languageCodes[0] || null,
    language_codes: normalized.languageCodes,
    source_owner: normalized.sourceOwner,
    ownership_evidence_url: normalized.ownershipEvidenceUrl,
    authorization_basis: normalized.authorizationBasis,
    terms_url: normalized.termsUrl,
    embed_policy: normalized.embedPolicy,
    embed_permitted: concertEmbedPermittedFlag(normalized.embedPolicy),
    content_scope: normalized.contentScope,
    expected_content_type: normalized.expectedContentType || normalized.contentScope,
    expected_concert_formats: normalized.expectedConcertFormats,
    supported_countries: normalized.supportedCountries,
    geo_restrictions: normalized.geoRestrictions,
    mature_content_possible: normalized.matureContentPossible,
    enabled: normalized.enabled,
    import_enabled: normalized.importEnabled,
    validation_method: normalized.validationMethod,
    reliability_score: normalized.reliabilityScore,
    last_reviewed_at: normalized.lastReviewedAt,
    review_notes: normalized.reviewNotes,
  };
}

export async function upsertConcertSource(source: ConcertSourceSeed) {
  const payload = mapConcertSourceSeedToRow(source);
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .upsert(payload, { onConflict: "stable_key" })
    .select(SOURCE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ConcertSourceRow;
}

export async function fetchConcertSourceByStableKey(stableKey: string) {
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .select(SOURCE_SELECT)
    .eq("stable_key", stableKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConcertSourceRow | null) || null;
}

export async function listEnabledConcertSources() {
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .select(SOURCE_SELECT)
    .eq("enabled", true)
    .order("reliability_score", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ConcertSourceRow[];
}

export async function listImportEnabledConcertSources() {
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .select(SOURCE_SELECT)
    .eq("enabled", true)
    .eq("import_enabled", true)
    .order("reliability_score", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ConcertSourceRow[];
}

export async function listConcertSourcesNeedingReview() {
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .select(SOURCE_SELECT)
    .or(
      [
        "enabled.eq.false",
        "authorization_basis.in.(unclear,denied)",
        "embed_policy.in.(unknown,prohibited)",
      ].join(",")
    )
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ConcertSourceRow[];
}

export async function disableConcertSource(stableKey: string, reason?: string) {
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .update({
      enabled: false,
      import_enabled: false,
      review_notes: reason || undefined,
    })
    .eq("stable_key", stableKey)
    .select(SOURCE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ConcertSourceRow;
}

export async function updateConcertSourceReliabilityScore(
  stableKey: string,
  reliabilityScore: number
) {
  if (!Number.isFinite(reliabilityScore) || reliabilityScore < 0 || reliabilityScore > 100) {
    throw new Error("reliabilityScore must be between 0 and 100");
  }
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .update({ reliability_score: Math.round(reliabilityScore) })
    .eq("stable_key", stableKey)
    .select(SOURCE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ConcertSourceRow;
}

export async function recordConcertSourceValidationSuccess(stableKey: string) {
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .update({ last_success_at: new Date().toISOString() })
    .eq("stable_key", stableKey)
    .select(SOURCE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ConcertSourceRow;
}

export async function recordConcertSourceValidationFailure(stableKey: string) {
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .update({ last_failure_at: new Date().toISOString() })
    .eq("stable_key", stableKey)
    .select(SOURCE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ConcertSourceRow;
}

export async function updateConcertSourceAuthorization(
  stableKey: string,
  authorizationBasis: ConcertAuthorizationBasis
) {
  const enabledMustDisable =
    authorizationBasis === "unclear" || authorizationBasis === "denied";
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .update({
      authorization_basis: authorizationBasis,
      ...(enabledMustDisable ? { enabled: false, import_enabled: false } : {}),
    })
    .eq("stable_key", stableKey)
    .select(SOURCE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ConcertSourceRow;
}

export async function updateConcertSourceEmbedPolicy(
  stableKey: string,
  embedPolicy: ConcertEmbedPolicy
) {
  const mustDisable =
    embedPolicy === "unknown" ||
    embedPolicy === "prohibited" ||
    embedPolicy === "external_link_only";
  const { data, error } = await supabaseAdmin
    .from("concert_sources")
    .update({
      embed_policy: embedPolicy,
      embed_permitted: concertEmbedPermittedFlag(embedPolicy),
      ...(mustDisable && embedPolicy !== "external_link_only"
        ? { enabled: false, import_enabled: false }
        : {}),
      ...(embedPolicy === "external_link_only" ? { import_enabled: false } : {}),
    })
    .eq("stable_key", stableKey)
    .select(SOURCE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return data as ConcertSourceRow;
}
