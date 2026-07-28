import type { NextRequest } from "next/server";

/**
 * Authoritative mature-content eligibility for public catalog APIs.
 *
 * Mature results may appear in normal search/browse only when both are true:
 * - mature content setting enabled
 * - age confirmation completed
 *
 * Dedicated /mature routes remain mature-only and still require this gate.
 */
export type MatureContentSettings = {
  matureContentEnabled?: boolean | null;
  ageConfirmed?: boolean | null;
};

export type MatureContentQuery = {
  mature_enabled?: string | null;
  matureEnabled?: string | null;
  includeMature?: string | null;
  include_mature?: string | null;
  age_confirmed?: string | null;
  ageConfirmed?: string | null;
};

export function parseMatureBoolean(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Settings-object form: `matureContentEnabled && ageConfirmed`. */
export function canAccessMatureContent(
  settings: MatureContentSettings | MatureContentQuery = {}
): boolean {
  if ("matureContentEnabled" in settings || "ageConfirmed" in settings) {
    const matureContentEnabled = (settings as MatureContentSettings).matureContentEnabled;
    const ageConfirmed = (settings as MatureContentSettings).ageConfirmed;
    if (typeof matureContentEnabled === "boolean" && typeof ageConfirmed === "boolean") {
      return matureContentEnabled === true && ageConfirmed === true;
    }
  }

  const query = settings as MatureContentQuery;
  const matureEnabled = parseMatureBoolean(
    query.mature_enabled ||
      query.matureEnabled ||
      query.includeMature ||
      query.include_mature ||
      null
  );
  const ageConfirmed = parseMatureBoolean(query.age_confirmed || query.ageConfirmed || null);
  return matureEnabled === true && ageConfirmed === true;
}

export function canAccessMatureContentFromSearchParams(
  params?: URLSearchParams | null
): boolean {
  if (!params) return false;
  return canAccessMatureContent({
    mature_enabled: params.get("mature_enabled"),
    matureEnabled: params.get("matureEnabled"),
    includeMature: params.get("includeMature"),
    include_mature: params.get("include_mature"),
    age_confirmed: params.get("age_confirmed"),
    ageConfirmed: params.get("ageConfirmed"),
  });
}

export function canAccessMatureContentFromRequest(
  request?: Pick<NextRequest, "nextUrl"> | null
): boolean {
  return canAccessMatureContentFromSearchParams(request?.nextUrl?.searchParams);
}
