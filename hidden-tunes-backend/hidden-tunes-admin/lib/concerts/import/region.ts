/**
 * Region availability metadata — region-limited concerts are valid.
 * Never bypass geo restrictions; store accurate metadata only.
 */

export type ConcertRegionAvailability =
  | "worldwide"
  | "allowlist"
  | "blocklist"
  | "unknown";

export type ConcertRegionMeta = {
  availability: ConcertRegionAvailability;
  allowedCountries: string[];
  blockedCountries: string[];
  evidence: Record<string, unknown>;
  lastCheckedAt: string;
};

export function normalizeCountryList(values: string[] | null | undefined): string[] {
  return Array.from(
    new Set(
      (values || [])
        .map((code) => String(code || "").trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code))
    )
  ).sort();
}

export function buildConcertRegionMeta(input: {
  allowed?: string[] | null;
  blocked?: string[] | null;
  providerReported?: boolean;
  now?: Date;
}): ConcertRegionMeta {
  const allowed = normalizeCountryList(input.allowed);
  const blocked = normalizeCountryList(input.blocked);
  let availability: ConcertRegionAvailability = "unknown";

  if (allowed.length === 0 && blocked.length === 0) {
    availability = input.providerReported ? "worldwide" : "unknown";
  } else if (allowed.length > 0) {
    availability = "allowlist";
  } else if (blocked.length > 0) {
    availability = "blocklist";
  }

  return {
    availability,
    allowedCountries: allowed,
    blockedCountries: blocked,
    evidence: {
      provider_reported: Boolean(input.providerReported),
      allowed_count: allowed.length,
      blocked_count: blocked.length,
    },
    lastCheckedAt: (input.now || new Date()).toISOString(),
  };
}

export function isConcertAvailableInCountry(
  meta: ConcertRegionMeta,
  countryCode: string | null | undefined
): { available: boolean; reason: string } {
  const code = String(countryCode || "")
    .trim()
    .toUpperCase();

  if (meta.availability === "worldwide") {
    return { available: true, reason: "worldwide" };
  }

  if (!code) {
    return { available: false, reason: "viewer_country_unknown" };
  }

  if (meta.availability === "allowlist") {
    return meta.allowedCountries.includes(code)
      ? { available: true, reason: "allowlist_hit" }
      : { available: false, reason: "allowlist_miss" };
  }

  if (meta.availability === "blocklist") {
    return meta.blockedCountries.includes(code)
      ? { available: false, reason: "blocklist_hit" }
      : { available: true, reason: "blocklist_clear" };
  }

  return { available: false, reason: "region_unknown" };
}
