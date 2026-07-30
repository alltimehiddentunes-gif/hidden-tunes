import type { NextRequest } from "next/server";

import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";
import {
  hasSuccessfulVerification,
  isTvPubliclyEligibleByEvidence,
  needsTvRevalidation,
  TV_REVALIDATION_INTERVAL_MS,
  type TvEvidenceEligibilityRow,
} from "@/lib/tvPublicEligibilityPolicy";

/**
 * Revalidation interval only — never a public visibility cutoff.
 * Name retained for mobile/desktop parity.
 */
export const TV_VALIDATION_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

export type TvClientPlatform = "ios" | "android" | "cross";

/** Main browse/catalog tier — public eligibility for videos/channels/stations. */
export const TV_CATALOG_ELIGIBILITY_VERIFIED = "verified" as const;

/** Search-only discovery tier — excluded from browse; may appear in explicit TV search. */
export const TV_CATALOG_ELIGIBILITY_SEARCH_ONLY = "search_only" as const;

export type TvCatalogEligibilityTier =
  | typeof TV_CATALOG_ELIGIBILITY_VERIFIED
  | typeof TV_CATALOG_ELIGIBILITY_SEARCH_ONLY;

export type TvPlatformEligibilityRow = TvEvidenceEligibilityRow;

export type TvPublicCatalogFilterOptions = {
  includeMature?: boolean;
};

export function parseTvClientPlatform(
  request?: Pick<NextRequest, "nextUrl" | "headers">
): TvClientPlatform {
  const queryPlatform = String(request?.nextUrl?.searchParams?.get("platform") || "")
    .trim()
    .toLowerCase();
  const headerPlatform = String(request?.headers?.get("x-hidden-tunes-platform") || "")
    .trim()
    .toLowerCase();

  const raw = queryPlatform || headerPlatform;
  if (raw === "ios") return "ios";
  if (raw === "android") return "android";
  return "cross";
}

/** Revalidation queue cutoff only — do not use as a public visibility filter. */
export function getValidationFreshnessCutoff(now = new Date()) {
  return new Date(now.getTime() - TV_REVALIDATION_INTERVAL_MS).toISOString();
}

/**
 * True when the last health check is within the revalidation interval.
 * Does **not** mean the channel is publicly ineligible when false.
 */
export function isValidationFresh(
  lastHealthCheckedAt: string | null | undefined,
  now = new Date()
) {
  return !needsTvRevalidation(lastHealthCheckedAt, now, TV_REVALIDATION_INTERVAL_MS);
}

export function isTvStationPublic(row: TvPlatformEligibilityRow) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.playback_status === "playable" &&
    Number(row.reliability_score ?? 0) >= TV_RELIABILITY_THRESHOLD &&
    !row.disabled_at &&
    !row.quarantined_at
  );
}

export function isTvStationVerified(row: TvPlatformEligibilityRow) {
  return row.status === "approved";
}

/**
 * Evidence-based platform eligibility for play/browse.
 * Requires prior successful verification; does **not** require a fresh timestamp.
 */
export function isTvStationEligibleForPlatform(
  row: TvPlatformEligibilityRow,
  platform: TvClientPlatform,
  _now = new Date()
) {
  if (!isTvPubliclyEligibleByEvidence(row)) return false;
  if (!isTvStationVerified(row)) return false;
  if (!hasSuccessfulVerification(row)) return false;

  if (platform === "ios") {
    return row.ios_playable === true && row.stream_is_https === true;
  }

  if (platform === "android") {
    return row.android_playable === true && row.stream_is_https === true;
  }

  return row.ios_playable === true && row.android_playable === true && row.stream_is_https === true;
}

export type SupabaseFilterQuery = {
  eq: (column: string, value: unknown) => SupabaseFilterQuery;
  gte: (column: string, value: unknown) => SupabaseFilterQuery;
  not: (column: string, operator: string, value: unknown) => SupabaseFilterQuery;
  is: (column: string, value: null) => SupabaseFilterQuery;
  ilike: (column: string, value: string) => SupabaseFilterQuery;
  or: (filters: string) => SupabaseFilterQuery;
  in: (column: string, values: unknown[]) => SupabaseFilterQuery;
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ) => SupabaseFilterQuery;
  range: (
    from: number,
    to: number
  ) => Promise<{ data: unknown; error: { message: string } | null; count: number | null }>;
};

export function isTvMatureColumnEnabled() {
  return process.env.TV_MATURE_ISOLATION_ENABLED === "true";
}

/**
 * Shared technical playability gates (evidence-based — no max-age timestamp gate).
 */
function applyTvPlayablePlatformFilters(
  query: SupabaseFilterQuery,
  platform: TvClientPlatform,
  _now: Date,
  options: TvPublicCatalogFilterOptions
) {
  query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .gte("reliability_score", TV_RELIABILITY_THRESHOLD)
    .is("disabled_at", null)
    .is("quarantined_at", null)
    // Prior successful verification required; age alone must not hide.
    .not("last_health_checked_at", "is", null);

  if (isTvMatureColumnEnabled()) {
    if (options.includeMature) {
      query.eq("is_mature", true).eq("mature_source_approved", true);
    } else {
      query.eq("is_mature", false);
    }
  }

  if (platform === "ios") {
    query.eq("ios_playable", true).eq("stream_is_https", true);
  } else if (platform === "android") {
    query.eq("android_playable", true).eq("stream_is_https", true);
  } else {
    query.eq("ios_playable", true).eq("android_playable", true).eq("stream_is_https", true);
  }
}

/** Verified main-catalog filters (browse, country rails, featured, platform counts). */
export function applyTvPublicCatalogFilters(
  query: SupabaseFilterQuery,
  platform: TvClientPlatform,
  now = new Date(),
  options: TvPublicCatalogFilterOptions = {}
): void {
  applyTvPlayablePlatformFilters(query, platform, now, options);
  query.eq("catalog_eligibility_tier", TV_CATALOG_ELIGIBILITY_VERIFIED);
}

/** Search-only discovery tier — same technical playability gates, excluded from browse. */
export function applyTvSearchDiscoveryCatalogFilters(
  query: SupabaseFilterQuery,
  platform: TvClientPlatform,
  now = new Date(),
  options: TvPublicCatalogFilterOptions = {}
): void {
  applyTvPlayablePlatformFilters(query, platform, now, options);
  query.eq("catalog_eligibility_tier", TV_CATALOG_ELIGIBILITY_SEARCH_ONLY);
}

export function parseIncludeMatureParam(
  request?: Pick<NextRequest, "nextUrl" | "headers">
) {
  const raw = String(
    request?.nextUrl?.searchParams?.get("includeMature") ||
      request?.nextUrl?.searchParams?.get("include_mature") ||
      request?.headers?.get("x-hidden-tunes-include-mature") ||
      ""
  )
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function isPlayUrlAllowedForPlatform(
  streamUrl: string,
  platform: TvClientPlatform
) {
  const cleaned = String(streamUrl || "").trim();
  if (!cleaned) return false;

  try {
    const parsed = new URL(cleaned);
    if (platform === "ios" || platform === "cross") {
      return parsed.protocol === "https:";
    }
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
