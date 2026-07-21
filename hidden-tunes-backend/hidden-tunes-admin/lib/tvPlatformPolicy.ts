import type { NextRequest } from "next/server";

import { TV_RELIABILITY_THRESHOLD } from "@/lib/tvStationHealth";

/** Single validation freshness window — 7 days. */
export const TV_VALIDATION_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000;

export type TvClientPlatform = "ios" | "android" | "cross";

/** Main browse/catalog tier — unchanged public eligibility rules. */
export const TV_CATALOG_ELIGIBILITY_VERIFIED = "verified" as const;

/** Search-only discovery tier — excluded from browse; may appear in explicit TV search. */
export const TV_CATALOG_ELIGIBILITY_SEARCH_ONLY = "search_only" as const;

export type TvCatalogEligibilityTier =
  | typeof TV_CATALOG_ELIGIBILITY_VERIFIED
  | typeof TV_CATALOG_ELIGIBILITY_SEARCH_ONLY;

export type TvPlatformEligibilityRow = {
  status?: string | null;
  is_active?: boolean | null;
  playback_status?: string | null;
  reliability_score?: number | null;
  consecutive_failures?: number | null;
  disabled_at?: string | null;
  quarantined_at?: string | null;
  ios_playable?: boolean | null;
  android_playable?: boolean | null;
  stream_is_https?: boolean | null;
  last_health_checked_at?: string | null;
  last_validation_result?: string | null;
  is_mature?: boolean | null;
  mature_source_approved?: boolean | null;
};

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

export function getValidationFreshnessCutoff(now = new Date()) {
  return new Date(now.getTime() - TV_VALIDATION_FRESHNESS_MS).toISOString();
}

export function isValidationFresh(
  lastHealthCheckedAt: string | null | undefined,
  now = new Date()
) {
  if (!lastHealthCheckedAt) return false;
  const checkedAt = new Date(lastHealthCheckedAt).getTime();
  if (!Number.isFinite(checkedAt)) return false;
  return now.getTime() - checkedAt <= TV_VALIDATION_FRESHNESS_MS;
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

export function isTvStationEligibleForPlatform(
  row: TvPlatformEligibilityRow,
  platform: TvClientPlatform,
  now = new Date()
) {
  if (!isTvStationPublic(row)) return false;
  if (!isTvStationVerified(row)) return false;
  if (!isValidationFresh(row.last_health_checked_at, now)) return false;

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

function applyTvPlayablePlatformFilters(
  query: SupabaseFilterQuery,
  platform: TvClientPlatform,
  now: Date,
  options: TvPublicCatalogFilterOptions
) {
  const cutoff = getValidationFreshnessCutoff(now);

  query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .gte("reliability_score", TV_RELIABILITY_THRESHOLD)
    .is("disabled_at", null)
    .is("quarantined_at", null)
    .gte("last_health_checked_at", cutoff);

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
