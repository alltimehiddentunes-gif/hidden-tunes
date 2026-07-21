export type RadioExpansionQueryKind =
  | "country"
  | "tag"
  | "language"
  | "global"
  | "clicks"
  | "recent"
  | "codec"
  | "state"
  | "name"
  | "name_order"
  | "clicks_asc"
  | "combo"
  | "bitrate"
  | "votes_asc"
  | "lastcheck"
  | "country_name"
  | "lang_combo"
  | "bylanguage"
  | "lastchange_asc"
  | "lastcheck_asc";

export type RadioExpansionQuery = {
  key: string;
  kind: RadioExpansionQueryKind;
  value: string;
  categorySlug: string;
  priority: number;
};

const COUNTRY_CODES = [
  "AF", "AL", "DZ", "AO", "AR", "AM", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BO",
  "BA", "BW", "BR", "BN", "BG", "BF", "BI", "KH", "CM", "CA", "CL", "CN", "CO", "CR", "CI", "HR", "CU", "CY",
  "CZ", "DK", "DO", "EC", "EG", "SV", "EE", "ET", "FI", "FR", "GA", "GE", "DE", "GH", "GR", "GT", "GN", "HT",
  "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KW", "LV",
  "LB", "LY", "LT", "LU", "MG", "MY", "ML", "MT", "MX", "MD", "MA", "MZ", "MM", "NP", "NL", "NZ", "NI", "NG",
  "MK", "NO", "OM", "PK", "PA", "PY", "PE", "PH", "PL", "PT", "PR", "QA", "RO", "RU", "RW", "SA", "SN", "RS",
  "SG", "SK", "SI", "ZA", "KR", "ES", "LK", "SD", "SE", "CH", "SY", "TW", "TZ", "TH", "TG", "TT", "TN", "TR",
  "UG", "UA", "AE", "GB", "US", "UY", "UZ", "VE", "VN", "YE", "ZM", "ZW",
] as const;

const UNDERREPRESENTED_COUNTRIES = new Set([
  "AF", "AO", "BJ", "BF", "BI", "KH", "CM", "CI", "ET", "GA", "GH", "GN", "HT", "KE", "MG", "ML", "MZ", "MM",
  "NG", "RW", "SN", "TG", "TZ", "UG", "ZM", "ZW", "BD", "LK", "NP", "MM", "LA", "MN", "KZ", "UZ", "GE", "AM",
  "AZ", "BY", "MD", "BA", "MK", "AL", "ME", "IS", "LU", "MT", "CY", "EE", "LV", "LT", "SK", "SI", "HR", "BG",
  "RO", "RS", "BO", "PY", "UY", "EC", "GT", "HN", "NI", "SV", "CR", "PA", "DO", "JM", "TT", "BB", "BZ", "GY",
  "FJ", "PG", "NC", "PF", "VU", "WS", "TO", "KI", "FM", "MH", "PW", "SB", "BN", "MO", "KH", "LA", "MN", "NP",
]);

const TAGS = [
  "pop", "rock", "alternative", "indie", "hip hop", "hip-hop", "rap", "rnb", "soul", "funk", "jazz", "blues",
  "country", "folk", "world", "african", "afrobeat", "afrobeats", "highlife", "amapiano", "reggae", "dancehall",
  "soca", "latin", "salsa", "bachata", "reggaeton", "brazilian", "caribbean", "classical", "opera", "orchestral",
  "instrumental", "electronic", "edm", "house", "techno", "trance", "drum and bass", "dubstep", "ambient",
  "chill", "lounge", "lofi", "oldies", "60s", "70s", "80s", "90s", "2000s", "soundtracks", "metal", "punk",
  "gospel", "christian", "islamic", "news", "talk", "sports", "business", "politics", "culture", "education",
  "science", "technology", "health", "lifestyle", "comedy", "community", "public radio", "university", "traffic",
  "weather", "local news", "talk radio", "easy listening", "smooth jazz", "classic rock", "classic hits",
  "world music", "religious", "catholic", "orthodox", "university radio", "student radio", "local radio",
  "regional", "national", "international", "language learning", "traffic", "public broadcasting",
] as const;

const LANGUAGES = [
  "english", "spanish", "french", "german", "portuguese", "italian", "russian", "chinese", "japanese", "korean",
  "arabic", "hindi", "bengali", "urdu", "indonesian", "malay", "thai", "vietnamese", "turkish", "polish",
  "dutch", "greek", "romanian", "ukrainian", "czech", "hungarian", "swedish", "norwegian", "danish", "finnish",
  "hebrew", "persian", "swahili", "amharic", "yoruba", "hausa", "zulu", "afrikaans", "tagalog", "tamil",
  "telugu", "marathi", "gujarati", "punjabi", "nepali", "sinhala", "burmese", "khmer", "lao", "mongolian",
  "kazakh", "uzbek", "georgian", "armenian", "azerbaijani", "serbian", "croatian", "bosnian", "slovak",
  "slovenian", "bulgarian", "albanian", "macedonian", "latvian", "lithuanian", "estonian", "icelandic",
  "welsh", "irish", "basque", "catalan", "galician", "malagasy", "somali", "tigrinya", "kurdish",
] as const;

function countryPriority(code: string) {
  return UNDERREPRESENTED_COUNTRIES.has(code) ? 1 : 3;
}

export function buildRadioExpansionQueries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const code of COUNTRY_CODES) {
    queries.push({
      key: `radio_browser:country:${code}`,
      kind: "country",
      value: code,
      categorySlug: "global",
      priority: countryPriority(code),
    });
  }

  for (const tag of TAGS) {
    queries.push({
      key: `radio_browser:tag:${tag.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "tag",
      value: tag,
      categorySlug: tag.toLowerCase().replace(/\s+/g, "-").slice(0, 80),
      priority: 2,
    });
  }

  for (const language of LANGUAGES) {
    queries.push({
      key: `radio_browser:language:${language}`,
      kind: "language",
      value: language,
      categorySlug: "global",
      priority: 2,
    });
  }

  queries.push(
    {
      key: "radio_browser:global:votes",
      kind: "global",
      value: "votes",
      categorySlug: "global",
      priority: 4,
    },
    {
      key: "radio_browser:global:clicks",
      kind: "clicks",
      value: "clickcount",
      categorySlug: "global",
      priority: 4,
    },
    {
      key: "radio_browser:global:recent",
      kind: "recent",
      value: "lastchange",
      categorySlug: "global",
      priority: 4,
    }
  );

  return queries.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
}

export function buildRadioBrowserPath(
  query: RadioExpansionQuery,
  limit: number,
  offset: number
) {
  const safeLimit = Math.max(1, Math.min(25, limit));
  const safeOffset = Math.max(0, offset);
  const common = `limit=${safeLimit}&offset=${safeOffset}&hidebroken=true`;

  if (query.kind === "country") {
    return `/json/stations/bycountrycodeexact/${encodeURIComponent(
      query.value
    )}?${common}&order=votes&reverse=true`;
  }
  if (query.kind === "tag") {
    return `/json/stations/search?tag=${encodeURIComponent(
      query.value
    )}&${common}&order=votes&reverse=true`;
  }
  if (query.kind === "language") {
    return `/json/stations/search?language=${encodeURIComponent(
      query.value
    )}&${common}&order=votes&reverse=true`;
  }
  if (query.kind === "clicks") {
    return `/json/stations/search?${common}&order=clickcount&reverse=true`;
  }
  if (query.kind === "recent") {
    return `/json/stations/search?${common}&order=lastchange&reverse=true`;
  }
  if (query.kind === "codec") {
    return `/json/stations/bycodec/${encodeURIComponent(query.value)}?${common}&order=votes&reverse=true`;
  }
  if (query.kind === "state") {
    const [countryCode, state] = query.value.split("|");
    return `/json/stations/search?countrycode=${encodeURIComponent(
      countryCode
    )}&state=${encodeURIComponent(state)}&${common}&order=votes&reverse=true`;
  }
  if (query.kind === "name") {
    return `/json/stations/search?name=${encodeURIComponent(
      query.value
    )}&${common}&order=votes&reverse=true`;
  }
  if (query.kind === "name_order") {
    return `/json/stations/search?${common}&order=name&reverse=false`;
  }
  if (query.kind === "clicks_asc") {
    return `/json/stations/search?${common}&order=clickcount&reverse=false`;
  }
  if (query.kind === "combo") {
    const [countryCode, tag] = query.value.split("|");
    return `/json/stations/search?countrycode=${encodeURIComponent(
      countryCode
    )}&tag=${encodeURIComponent(tag)}&${common}&order=votes&reverse=true`;
  }
  if (query.kind === "bitrate") {
    return `/json/stations/search?bitrateMin=${encodeURIComponent(
      query.value
    )}&${common}&order=votes&reverse=true`;
  }
  if (query.kind === "votes_asc") {
    return `/json/stations/search?${common}&order=votes&reverse=false`;
  }
  if (query.kind === "lastcheck") {
    return `/json/stations/search?${common}&order=lastchecktime&reverse=true`;
  }
  if (query.kind === "country_name") {
    return `/json/stations/bycountry/${encodeURIComponent(
      query.value
    )}?${common}&order=votes&reverse=true`;
  }
  if (query.kind === "lang_combo") {
    const [language, tag] = query.value.split("|");
    return `/json/stations/search?language=${encodeURIComponent(
      language
    )}&tag=${encodeURIComponent(tag)}&${common}&order=votes&reverse=true`;
  }
  if (query.kind === "bylanguage") {
    return `/json/stations/bylanguage/${encodeURIComponent(
      query.value
    )}?${common}&order=votes&reverse=true`;
  }
  if (query.kind === "lastchange_asc") {
    return `/json/stations/search?${common}&order=lastchange&reverse=false`;
  }
  if (query.kind === "lastcheck_asc") {
    return `/json/stations/search?${common}&order=lastchecktime&reverse=false`;
  }
  return `/json/stations/search?${common}&order=votes&reverse=true`;
}

export const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://all.api.radio-browser.info",
] as const;
