/**
 * Shared TV public-search query helpers (local backend contract).
 * Does not mutate titles in storage — only shapes the request boundary.
 */

/** Trim, collapse whitespace, turn hyphen/underscore separators into spaces. */
export function normalizeTvSearchQuery(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Exact country-name / common-alias → ISO code.
 * Ambiguous free-text two-letter tokens are excluded unless listed as aliases.
 */
const TV_COUNTRY_NAME_TO_CODE: Record<string, string> = {
  afghanistan: "AF",
  albania: "AL",
  algeria: "DZ",
  argentina: "AR",
  australia: "AU",
  austria: "AT",
  bangladesh: "BD",
  belgium: "BE",
  brazil: "BR",
  canada: "CA",
  chile: "CL",
  china: "CN",
  colombia: "CO",
  croatia: "HR",
  "czech republic": "CZ",
  czechia: "CZ",
  denmark: "DK",
  egypt: "EG",
  ethiopia: "ET",
  finland: "FI",
  france: "FR",
  germany: "DE",
  ghana: "GH",
  greece: "GR",
  "hong kong": "HK",
  hungary: "HU",
  india: "IN",
  indonesia: "ID",
  iran: "IR",
  iraq: "IQ",
  ireland: "IE",
  israel: "IL",
  italy: "IT",
  jamaica: "JM",
  japan: "JP",
  kenya: "KE",
  korea: "KR",
  "south korea": "KR",
  "north korea": "KP",
  lebanon: "LB",
  malaysia: "MY",
  mexico: "MX",
  morocco: "MA",
  mozambique: "MZ",
  namibia: "NA",
  netherlands: "NL",
  "new zealand": "NZ",
  nigeria: "NG",
  norway: "NO",
  pakistan: "PK",
  peru: "PE",
  philippines: "PH",
  poland: "PL",
  portugal: "PT",
  qatar: "QA",
  romania: "RO",
  russia: "RU",
  "saudi arabia": "SA",
  senegal: "SN",
  serbia: "RS",
  singapore: "SG",
  "south africa": "ZA",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  taiwan: "TW",
  tanzania: "TZ",
  thailand: "TH",
  turkey: "TR",
  uganda: "UG",
  ukraine: "UA",
  "united arab emirates": "AE",
  uae: "AE",
  "united kingdom": "GB",
  "great britain": "GB",
  uk: "GB",
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  venezuela: "VE",
  vietnam: "VN",
  zimbabwe: "ZW",
};

export function resolveTvCountryCode(raw: string): string | null {
  const key = normalizeTvSearchQuery(raw).toLowerCase();
  if (!key) return null;
  if (/^[a-z]{2}$/i.test(key) && TV_COUNTRY_NAME_TO_CODE[key]) {
    return TV_COUNTRY_NAME_TO_CODE[key];
  }
  return TV_COUNTRY_NAME_TO_CODE[key] ?? null;
}

/**
 * Resolve a `country=` filter value: accept ISO codes or known country names.
 * Unknown values pass through unchanged for backward-compatible ILIKE.
 */
export function resolveTvCountryFilter(raw: string): string {
  const cleaned = normalizeTvSearchQuery(raw);
  if (!cleaned) return cleaned;
  if (/^[A-Za-z]{2}$/.test(cleaned)) return cleaned.toUpperCase();
  return resolveTvCountryCode(cleaned) || cleaned;
}

/** Build PostgREST `or=(...)` filter covering approved public search fields. */
export function buildTvTextSearchOrFilter(rawQuery: string): string | null {
  const normalized = normalizeTvSearchQuery(rawQuery);
  if (normalized.length < 2) return null;

  const escaped = normalized.replace(/[%_]/g, "\\$&");
  const tagToken = normalized
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const parts = [
    `title.ilike.%${escaped}%`,
    `channel_name.ilike.%${escaped}%`,
    `category.ilike.%${escaped}%`,
    `genre.ilike.%${escaped}%`,
    `mood.ilike.%${escaped}%`,
    `format.ilike.%${escaped}%`,
    `language.ilike.%${escaped}%`,
    `region.ilike.%${escaped}%`,
  ];

  if (tagToken) {
    parts.push(`tags.cs.{${tagToken}}`);
  }

  const countryCode = resolveTvCountryCode(normalized);
  if (countryCode) {
    parts.push(`region.ilike.%${countryCode}%`);
  }

  return parts.join(",");
}
