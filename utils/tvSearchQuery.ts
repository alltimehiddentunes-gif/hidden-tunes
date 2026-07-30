/**
 * TV search query helpers for the mobile catalogue client.
 *
 * Production `/api/tv/videos` stores region as ISO country codes (ZA, US, …)
 * and matches free-text `q` with ILIKE. Country *names* and hyphenated titles
 * therefore miss eligible rows unless normalised before the request.
 */

/** Trim, collapse whitespace, and turn hyphen/underscore separators into spaces. */
export function normalizeTvSearchQuery(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exact country-name / common-alias → ISO code.
 * Ambiguous two-letter tokens are intentionally excluded unless listed as aliases
 * (e.g. "uk", "usa") so free-text queries like "af" keep title ILIKE behaviour.
 */
const TV_SEARCH_COUNTRY_NAME_TO_CODE: Record<string, string> = {
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

export function resolveTvSearchCountryCode(rawQuery: string): string | null {
  const key = normalizeTvSearchQuery(rawQuery).toLowerCase();
  if (!key) return null;
  return TV_SEARCH_COUNTRY_NAME_TO_CODE[key] ?? null;
}
