import type { NextRequest } from "next/server";

import {
  RADIO_PUBLIC_RELIABILITY_THRESHOLD,
  getRadioReliabilityScore,
  parseRadioBoolean,
} from "@/lib/radioPublicCatalog";

export function matureRadioGateEnabled(query: {
  mature_enabled?: string | null;
  matureEnabled?: string | null;
  age_confirmed?: string | null;
  ageConfirmed?: string | null;
  includeMature?: string | null;
  include_mature?: string | null;
}) {
  const matureEnabled = parseRadioBoolean(
    query.mature_enabled || query.matureEnabled || query.includeMature || query.include_mature || null
  );
  const ageConfirmed = parseRadioBoolean(query.age_confirmed || query.ageConfirmed || null);
  return matureEnabled === true && ageConfirmed === true;
}

export function parseMatureRadioAccess(request?: Pick<NextRequest, "nextUrl" | "headers">) {
  const params = request?.nextUrl?.searchParams;
  return matureRadioGateEnabled({
    mature_enabled: params?.get("mature_enabled"),
    matureEnabled: params?.get("matureEnabled"),
    age_confirmed: params?.get("age_confirmed"),
    ageConfirmed: params?.get("ageConfirmed"),
    includeMature: params?.get("includeMature"),
    include_mature: params?.get("include_mature"),
  });
}

type RadioFilterBuilder<T> = {
  eq(column: string, value: unknown): T;
  is(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  or(filters: string): T;
  ilike(column: string, pattern: string): T;
};

export function isPublicMatureRadioRow(row: Record<string, unknown>) {
  return (
    row.status === "approved" &&
    row.is_active === true &&
    row.is_verified === true &&
    row.playback_status === "playable" &&
    row.is_mature === true &&
    row.mature_source_approved === true &&
    row.mature_review_status === "confirmed" &&
    row.rights_status === "approved" &&
    row.is_free === true &&
    row.requires_payment !== true &&
    row.requires_drm !== true &&
    !row.quarantined_at &&
    !row.disabled_at &&
    getRadioReliabilityScore(row) >= RADIO_PUBLIC_RELIABILITY_THRESHOLD
  );
}

export function applyMatureRadioPublicFilters<T extends RadioFilterBuilder<T>>(query: T) {
  return query
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("is_verified", true)
    .eq("playback_status", "playable")
    .eq("is_mature", true)
    .eq("mature_source_approved", true)
    .eq("mature_review_status", "confirmed")
    .eq("rights_status", "approved")
    .eq("is_free", true)
    .is("quarantined_at", null)
    .is("disabled_at", null)
    .gte("reliability_score", RADIO_PUBLIC_RELIABILITY_THRESHOLD);
}

export function redactStreamUrl(url: string | null | undefined) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.hostname}/…`;
  } catch {
    return "[redacted]";
  }
}
