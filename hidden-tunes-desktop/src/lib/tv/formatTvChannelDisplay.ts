/**
 * Presentation-only TV channel display helpers.
 * Never mutate stored catalog data, IDs, playback, or search indexes — format at render time.
 */

const TECH_PAREN_PATTERN =
  /\s*\((?:4k|8k|uhd|fhd|qhd|sd|hd|4320p|2160p|1440p|1080p|720p|576p|480p|360p|240p|hevc|h\.?265|h\.?264|avc|hls|dash|mpeg-?ts|mpegts|mp4)\)\s*/gi;

const TECH_BRACKET_PATTERN =
  /\s*\[(?:4k|8k|uhd|fhd|qhd|sd|hd|4320p|2160p|1440p|1080p|720p|576p|480p|360p|240p|hevc|h\.?265|hls|mpeg-?ts)\]\s*/gi;

const TECH_BARE_SUFFIX_PATTERN =
  /\s+(?:4k|8k|uhd|fhd|4320p|2160p|1440p|1080p|720p|576p|480p|360p|240p|hevc|h\.?265|hls|mpeg-?ts)\s*$/i;

const PROVIDER_CODE_PATTERN =
  /\b([A-Z]{2})_[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\b/g;

const STREAM_ID_PATTERN =
  /\b(?:ch|channel|stream|src|feed)[-_]?\d{3,}\b/gi;

const QUALITY_TOKEN_PATTERN =
  /\b(4320p|2160p|1440p|1080p|720p|576p|480p|360p|240p|8k|4k|uhd|qhd|fhd|hd|sd)\b/i;

/** Compact display labels for ISO country codes (consumer-facing, not full legal names). */
export const TV_COUNTRY_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  US: "USA",
  GB: "UK",
  UK: "UK",
  AE: "UAE",
  KR: "South Korea",
  KP: "North Korea",
  RU: "Russia",
  CZ: "Czechia",
  NL: "Netherlands",
  ZA: "South Africa",
  AF: "Afghanistan",
  AL: "Albania",
  DZ: "Algeria",
  AD: "Andorra",
  AO: "Angola",
  AR: "Argentina",
  AM: "Armenia",
  AU: "Australia",
  AT: "Austria",
  AZ: "Azerbaijan",
  BH: "Bahrain",
  BD: "Bangladesh",
  BY: "Belarus",
  BE: "Belgium",
  BZ: "Belize",
  BJ: "Benin",
  BO: "Bolivia",
  BA: "Bosnia",
  BW: "Botswana",
  BR: "Brazil",
  BN: "Brunei",
  BG: "Bulgaria",
  BF: "Burkina Faso",
  BI: "Burundi",
  KH: "Cambodia",
  CM: "Cameroon",
  CA: "Canada",
  CV: "Cape Verde",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CR: "Costa Rica",
  HR: "Croatia",
  CU: "Cuba",
  CY: "Cyprus",
  DK: "Denmark",
  DO: "Dominican Republic",
  EC: "Ecuador",
  EG: "Egypt",
  SV: "El Salvador",
  EE: "Estonia",
  ET: "Ethiopia",
  FI: "Finland",
  FR: "France",
  GA: "Gabon",
  GE: "Georgia",
  DE: "Germany",
  GH: "Ghana",
  GR: "Greece",
  GT: "Guatemala",
  HN: "Honduras",
  HK: "Hong Kong",
  HU: "Hungary",
  IS: "Iceland",
  IN: "India",
  ID: "Indonesia",
  IR: "Iran",
  IQ: "Iraq",
  IE: "Ireland",
  IL: "Israel",
  IT: "Italy",
  JM: "Jamaica",
  JP: "Japan",
  JO: "Jordan",
  KZ: "Kazakhstan",
  KE: "Kenya",
  KW: "Kuwait",
  LV: "Latvia",
  LB: "Lebanon",
  LY: "Libya",
  LT: "Lithuania",
  LU: "Luxembourg",
  MO: "Macau",
  MY: "Malaysia",
  MT: "Malta",
  MX: "Mexico",
  MD: "Moldova",
  MC: "Monaco",
  MN: "Mongolia",
  ME: "Montenegro",
  MA: "Morocco",
  MZ: "Mozambique",
  MM: "Myanmar",
  NA: "Namibia",
  NP: "Nepal",
  NZ: "New Zealand",
  NI: "Nicaragua",
  NG: "Nigeria",
  MK: "North Macedonia",
  NO: "Norway",
  OM: "Oman",
  PK: "Pakistan",
  PA: "Panama",
  PY: "Paraguay",
  PE: "Peru",
  PH: "Philippines",
  PL: "Poland",
  PT: "Portugal",
  PR: "Puerto Rico",
  QA: "Qatar",
  RO: "Romania",
  RW: "Rwanda",
  SA: "Saudi Arabia",
  SN: "Senegal",
  RS: "Serbia",
  SG: "Singapore",
  SK: "Slovakia",
  SI: "Slovenia",
  SO: "Somalia",
  ES: "Spain",
  LK: "Sri Lanka",
  SE: "Sweden",
  CH: "Switzerland",
  SY: "Syria",
  TW: "Taiwan",
  TZ: "Tanzania",
  TH: "Thailand",
  TN: "Tunisia",
  TR: "Turkey",
  UG: "Uganda",
  UA: "Ukraine",
  UY: "Uruguay",
  UZ: "Uzbekistan",
  VE: "Venezuela",
  VN: "Vietnam",
  YE: "Yemen",
  ZM: "Zambia",
  ZW: "Zimbabwe",
};

const QUALITY_DISPLAY: Record<string, string> = {
  "240p": "SD",
  "360p": "SD",
  "480p": "SD",
  "576p": "SD",
  sd: "SD",
  "720p": "HD",
  hd: "HD",
  "1080p": "Full HD",
  fhd: "Full HD",
  "1440p": "Quad HD",
  qhd: "Quad HD",
  "2160p": "4K",
  "4k": "4K",
  uhd: "4K",
  "4320p": "8K",
  "8k": "8K",
};

function collapseWhitespace(value: string) {
  return value.replace(/\s{2,}/g, " ").trim();
}

function titleCaseProvider(token: string) {
  const cleaned = token.replace(/_/g, " ").trim().toLowerCase();
  if (!cleaned) return "";
  return cleaned.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/** Infer a quality token from a raw title for badge display (does not mutate the title). */
export function inferQualityFromTitle(title?: string | null): string | null {
  const text = String(title || "").trim();
  if (!text) return null;
  const match = text.match(QUALITY_TOKEN_PATTERN);
  return match?.[1] ?? null;
}

/**
 * Clean channel title for browsing/player chrome.
 * Falls back to the original title when cleaning would empty or over-strip the name.
 */
export function formatChannelDisplayName(title?: string | null): string {
  const original = String(title || "").trim();
  if (!original) return "";

  let cleaned = original
    .replace(TECH_PAREN_PATTERN, " ")
    .replace(TECH_BRACKET_PATTERN, " ")
    .replace(TECH_BARE_SUFFIX_PATTERN, "")
    .replace(PROVIDER_CODE_PATTERN, " ")
    .replace(STREAM_ID_PATTERN, " ");

  cleaned = collapseWhitespace(cleaned).replace(/[\s|_/-]+$/g, "").trim();

  if (!cleaned || cleaned.length < 2) {
    return original;
  }

  return cleaned;
}

/** Map internal resolution / quality codes to consumer badges. No raw numbers shown. */
export function formatQualityBadge(quality?: string | null): string | null {
  const raw = String(quality || "").trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase().replace(/\s+/g, "");
  if (QUALITY_DISPLAY[normalized]) {
    return QUALITY_DISPLAY[normalized];
  }

  // Already a consumer label
  if (
    /^(sd|hd|full\s*hd|quad\s*hd|4k|8k)$/i.test(raw) ||
    raw === "Full HD" ||
    raw === "Quad HD"
  ) {
    if (/^full\s*hd$/i.test(raw)) return "Full HD";
    if (/^quad\s*hd$/i.test(raw)) return "Quad HD";
    if (/^fhd$/i.test(raw)) return "Full HD";
    if (/^4k$/i.test(raw)) return "4K";
    if (/^8k$/i.test(raw)) return "8K";
    if (/^hd$/i.test(raw)) return "HD";
    if (/^sd$/i.test(raw)) return "SD";
  }

  const inferred = QUALITY_DISPLAY[normalized.replace(/[()[\]]/g, "")];
  return inferred ?? null;
}

/**
 * Resolve the best quality badge from an explicit quality field and/or title suffixes.
 */
export function resolveQualityBadge(options: {
  quality?: string | null;
  title?: string | null;
}): string | null {
  return (
    formatQualityBadge(options.quality) ||
    formatQualityBadge(inferQualityFromTitle(options.title))
  );
}

/** Turn ISO codes / provider region codes into a clean country label. */
export function formatCountryLabel(country?: string | null): string | null {
  const raw = String(country || "").trim();
  if (!raw) return null;

  // Provider-style region codes: US_XUMO → USA
  const providerMatch = raw.match(/^([A-Za-z]{2})_[A-Za-z0-9_]+$/);
  if (providerMatch) {
    return formatCountryLabel(providerMatch[1]);
  }

  const upper = raw.toUpperCase();
  if (TV_COUNTRY_DISPLAY_LABELS[upper]) {
    return TV_COUNTRY_DISPLAY_LABELS[upper];
  }

  // Already a readable name
  if (raw.length > 2) {
    return raw;
  }

  return upper;
}

/**
 * Player/details attribution only — not for browse grids.
 * Example: US_XUMO → "Powered by Xumo"
 */
export function formatProviderAttribution(
  providerOrCode?: string | null
): string | null {
  const raw = String(providerOrCode || "").trim();
  if (!raw) return null;

  const providerMatch = raw.match(/^[A-Za-z]{2}_([A-Za-z0-9_]+)$/);
  if (providerMatch) {
    const name = titleCaseProvider(providerMatch[1]);
    return name ? `Powered by ${name}` : null;
  }

  // Plain provider slug
  if (/^[A-Za-z][A-Za-z0-9_-]{1,40}$/.test(raw) && !/^\d+$/.test(raw)) {
    const name = titleCaseProvider(raw.replace(/-/g, "_"));
    return name ? `Powered by ${name}` : null;
  }

  return null;
}

/** Extract a provider attribution string from a raw title, if present. */
export function formatProviderAttributionFromTitle(
  title?: string | null
): string | null {
  const text = String(title || "").trim();
  if (!text) return null;
  const match = text.match(/\b([A-Z]{2}_[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)\b/);
  return match ? formatProviderAttribution(match[1]) : null;
}

export function formatTvBrowseMeta(options: {
  category?: string | null;
  country?: string | null;
  language?: string | null;
}): string {
  const parts = [
    options.category ? String(options.category).trim() : "",
    formatCountryLabel(options.country) || "",
    options.language ? String(options.language).trim() : "",
  ].filter(Boolean);

  return parts.join(" · ");
}
