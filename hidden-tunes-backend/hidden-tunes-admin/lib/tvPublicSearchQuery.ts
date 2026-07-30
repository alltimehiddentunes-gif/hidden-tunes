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

/** Known search aliases → additional title phrases (no DB mutation). */
const TV_SEARCH_TITLE_SYNONYMS: Record<string, string[]> = {
  alone: ["Alone By History"],
  "alone tv": ["Alone By History"],
  "alone television": ["Alone By History"],
  "alone channel": ["Alone By History"],
  "storage wars": ["Storage Wars", "Pluto TV Storage Wars"],
  "storage wars tv": ["Storage Wars", "Pluto TV Storage Wars"],
  "storage wars television": ["Storage Wars", "Pluto TV Storage Wars"],
  "storage wars channel": ["Storage Wars", "Pluto TV Storage Wars"],
  "deadliest catch": ["Deadliest Catch", "Warner Bros TV Deadliest Catch"],
  "ice road": ["Ice Road Truckers"],
  "ice road truckers": ["Ice Road Truckers"],
  "live pd": ["Live PD", "Live PD Presents", "A&E Live PD"],
  "pawn stars": ["Pickers & Pawn", "Hardcore Pawn"],
  "history channel": ["True History Channel", "Alone By History"],
};

/** Drop common channel suffixes so "Storage Wars TV" still matches catalogue titles. */
const TV_SEARCH_FILLER_WORDS = new Set([
  "tv",
  "television",
  "channel",
  "network",
  "live",
  "plus",
  "official",
]);

function quoteSearchFilterValue(value: string) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Expand a user query into phrases that should all be OR-matched.
 * Keeps the original phrase, drops filler suffixes, and applies brand synonyms.
 */
export function expandTvSearchPhrases(rawQuery: string): string[] {
  const normalized = normalizeTvSearchQuery(rawQuery);
  if (normalized.length < 2) return [];

  const phrases = new Set<string>();
  phrases.add(normalized);

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const withoutFiller = tokens
    .filter((t) => !TV_SEARCH_FILLER_WORDS.has(t.toLowerCase()))
    .join(" ")
    .trim();
  if (withoutFiller.length >= 2) phrases.add(withoutFiller);

  for (const phrase of [...phrases]) {
    for (const synonym of TV_SEARCH_TITLE_SYNONYMS[phrase.toLowerCase()] || []) {
      phrases.add(synonym);
    }
  }

  return [...phrases];
}

/**
 * Field match clauses. Short single-token queries use boundary-ish patterns so
 * `Alone` does not match substring hits inside words like `pantalones`.
 */
function buildTvFieldMatchClauses(field: string, term: string): string[] {
  const escaped = term.replace(/[%_]/g, "\\$&");
  const isShortToken = !/\s/.test(escaped) && escaped.length <= 6;
  if (isShortToken) {
    return [
      `${field}.ilike.${quoteSearchFilterValue(`${escaped}%`)}`,
      `${field}.ilike.${quoteSearchFilterValue(`% ${escaped}%`)}`,
      `${field}.ilike.${quoteSearchFilterValue(`%-${escaped}%`)}`,
      `${field}.ilike.${quoteSearchFilterValue(`%(${escaped}%`)}`,
      `${field}.ilike.${quoteSearchFilterValue(`[${escaped}%`)}`,
    ];
  }
  return [`${field}.ilike.${quoteSearchFilterValue(`%${escaped}%`)}`];
}

/** Build PostgREST `or=(...)` filter covering approved public search fields. */
export function buildTvTextSearchOrFilter(rawQuery: string): string | null {
  const phrases = expandTvSearchPhrases(rawQuery);
  if (!phrases.length) return null;

  const fields = [
    "title",
    "channel_name",
    "category",
    "genre",
    "mood",
    "format",
    "language",
    "region",
  ] as const;

  const parts: string[] = [];
  for (const phrase of phrases) {
    for (const field of fields) {
      parts.push(...buildTvFieldMatchClauses(field, phrase));
    }

    const tagToken = phrase
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    if (tagToken) {
      parts.push(`tags.cs.{${quoteSearchFilterValue(tagToken)}}`);
    }

    const countryCode = resolveTvCountryCode(phrase);
    if (countryCode) {
      parts.push(`region.ilike.${quoteSearchFilterValue(`%${countryCode}%`)}`);
    }
  }

  return [...new Set(parts)].join(",");
}
