import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 12 — deeper cross-cuts: country×clicks/lastcheck, tag long-tail,
 * language×tag, and include-broken language/tag slices.
 */

const COUNTRY_CODES = [
  "AF","AL","DZ","AO","AR","AM","AU","AT","AZ","BS","BH","BD","BB","BY","BE","BZ","BJ","BO",
  "BA","BW","BR","BN","BG","BF","BI","KH","CM","CA","CL","CN","CO","CR","CI","HR","CU","CY",
  "CZ","DK","DO","EC","EG","SV","EE","ET","FI","FR","GA","GE","DE","GH","GR","GT","GN","HT",
  "HN","HK","HU","IS","IN","ID","IR","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KW","LV",
  "LB","LY","LT","LU","MG","MY","ML","MT","MX","MD","MA","MZ","MM","NP","NL","NZ","NI","NG",
  "MK","NO","OM","PK","PA","PY","PE","PH","PL","PT","PR","QA","RO","RU","RW","SA","SN","RS",
  "SG","SK","SI","ZA","KR","ES","LK","SD","SE","CH","SY","TW","TZ","TH","TG","TT","TN","TR",
  "UG","UA","AE","GB","US","UY","UZ","VE","VN","YE","ZM","ZW","ME","XK","PS","SS","CD","CG",
  "NA","LS","SZ","MW","SO","DJ","ER","TD","NE","MR","GM","SL","LR","GQ","ST","CV","KM","SC",
  "MU","BT","MV","TL","SB","VU","WS","TO","NC","PF","GU","AS","VI","CW","AW","SX","MO","LA",
  "MN","TJ","TM","KG","GY","SR","GF","RE","MQ","GP","FO","GL","LI","AD","MC","SM","VA","IM",
  "JE","GG","AX","FJ","PG","KI","FM","MH","PW",
] as const;

const DEEP_TAGS = [
  "community", "university", "student", "college", "campus", "public radio", "local",
  "regional", "indie", "underground", "pirate", "freeform", "eclectic", "experimental",
  "ambient", "drone", "noise", "industrial", "post-punk", "shoegaze", "garage", "psych",
  "afrobeats", "amapiano", "highlife", "soukous", "kwaito", "bhangra", "cumbia", "vallenato",
  "forro", "sertanejo", "mpb", "fado", "flamenco", "klezmer", "rebetiko", "rai", "chaabi",
  "gospel", "worship", "catholic", "orthodox", "buddhist", "hindu", "quran", "nasheed",
  "traffic", "weather", "marine", "aviation", "scanner", "ham radio", "shortwave",
  "children", "kids", "storytelling", "audiobook", "meditation", "yoga", "sleep",
  "lofi", "chillhop", "synthwave", "vaporwave", "retrowave", "drum and bass", "jungle",
  "techno", "minimal", "deep house", "afro house", "baile funk", "reggaeton", "dancehall",
  "news talk", "sports talk", "politics", "comedy", "interview", "documentary",
] as const;

const DEEP_LANGUAGES = [
  "english", "spanish", "french", "portuguese", "german", "italian", "russian", "arabic",
  "chinese", "japanese", "korean", "hindi", "bengali", "urdu", "indonesian", "swahili",
  "turkish", "polish", "dutch", "greek", "romanian", "ukrainian", "czech", "hungarian",
  "swedish", "norwegian", "danish", "finnish", "hebrew", "persian", "thai", "vietnamese",
  "tagalog", "tamil", "telugu", "yoruba", "hausa", "zulu", "afrikaans", "amharic",
  "malagasy", "somali", "kurdish", "catalan", "basque", "galician", "welsh", "irish",
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").slice(0, 80);
}

export function buildRadioExpansionBatch19Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const kind of [
    "votes_asc",
    "clicks_asc",
    "lastcheck_asc",
    "lastchange_asc",
    "name_order",
    "global_include_broken",
  ] as const) {
    queries.push({
      key: `radio_browser:${kind}:wave12-deep`,
      kind,
      value: `${kind}-wave12`,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const code of COUNTRY_CODES) {
    queries.push({
      key: `radio_browser:country_clicks:${code.toLowerCase()}:wave12`,
      kind: "country_clicks",
      value: code,
      categorySlug: "global",
      priority: 2,
    });
    queries.push({
      key: `radio_browser:country_lastcheck:${code.toLowerCase()}:wave12`,
      kind: "country_lastcheck",
      value: code,
      categorySlug: "global",
      priority: 2,
    });
    queries.push({
      key: `radio_browser:country_include_broken:${code.toLowerCase()}:wave12-b`,
      kind: "country_include_broken",
      value: code,
      categorySlug: "global",
      priority: 3,
    });
  }

  for (const tag of DEEP_TAGS) {
    queries.push({
      key: `radio_browser:tag_votes_asc:${slug(tag)}:wave12`,
      kind: "tag_votes_asc",
      value: tag,
      categorySlug: slug(tag),
      priority: 2,
    });
    queries.push({
      key: `radio_browser:tag_clicks:${slug(tag)}:wave12`,
      kind: "tag_clicks",
      value: tag,
      categorySlug: slug(tag),
      priority: 3,
    });
    queries.push({
      key: `radio_browser:tag_include_broken:${slug(tag)}:wave12`,
      kind: "tag_include_broken",
      value: tag,
      categorySlug: slug(tag),
      priority: 3,
    });
  }

  for (const language of DEEP_LANGUAGES) {
    queries.push({
      key: `radio_browser:language_include_broken:${slug(language)}:wave12`,
      kind: "language_include_broken",
      value: language,
      categorySlug: "global",
      priority: 2,
    });
    for (const tag of ["news", "music", "talk", "community", "religious"] as const) {
      queries.push({
        key: `radio_browser:lang_combo:${slug(language)}-${tag}:wave12`,
        kind: "lang_combo",
        value: `${language}|${tag}`,
        categorySlug: "global",
        priority: 4,
      });
    }
  }

  return queries;
}
