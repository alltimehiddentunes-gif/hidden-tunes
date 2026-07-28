import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 4 — Gap closure via alternate Radio Browser orderings + deep name/codec coverage.
 * Uses query keys distinct from batch8–10 so exhausted checkpoints do not block yield.
 */

const WEAK_COUNTRY_CODES = [
  "AF", "AO", "BJ", "BF", "BI", "KH", "CM", "CI", "ET", "GA", "GH", "GN", "HT", "KE", "MG",
  "ML", "MZ", "MM", "NG", "RW", "SN", "TG", "TZ", "UG", "ZM", "ZW", "BD", "LK", "NP", "LA",
  "MN", "KZ", "UZ", "GE", "AM", "AZ", "BY", "MD", "BA", "MK", "AL", "ME", "IS", "LU", "MT",
  "CY", "EE", "LV", "LT", "SK", "SI", "HR", "BG", "RO", "RS", "BO", "PY", "UY", "EC", "GT",
  "HN", "NI", "SV", "CR", "PA", "DO", "JM", "TT", "BB", "BZ", "GY", "FJ", "PG", "BN", "MO",
  "NA", "BW", "LS", "SZ", "MW", "SO", "DJ", "ER", "SS", "TD", "NE", "MR", "GM", "SL", "LR",
  "CG", "CD", "CF", "GQ", "ST", "CV", "KM", "SC", "MU", "YE", "OM", "IQ", "SY", "LY", "SD",
  "PS", "JO", "LB", "KW", "BH", "QA", "TM", "TJ", "KG", "MN", "BT", "MV", "TL", "SB", "VU",
  "WS", "TO", "KI", "FM", "MH", "PW", "NC", "PF", "GU", "AS", "VI", "PR", "CW", "AW", "SX",
] as const;

const RADIO_NAME_WORDS = [
  "radio", "FM", "AM", "Radio", "Radio Nacional", "Radio Pública", "Radio Pública",
  "Radio Community", "Community FM", "Campus FM", "Student Radio", "Local Radio",
  "rádio", "radiofonía", "radiostation", "radiostacja", "радио", "راديو", "วิทยุ",
  "ラジオ", "라디오", "电台", "廣播", "रेडियो", "রেডিও", "رادیو", "ραδιόφωνο",
  "radyo", "radioul", "rádió", "raadío", "radioja", "radiostasija",
] as const;

const CODECS = ["MP3", "AAC", "AAC+", "OGG", "FLAC", "OPUS", "WMA"] as const;
const BITRATE_MINS = ["32", "48", "64", "96", "128", "160", "192", "256", "320"] as const;

const GENRE_DEPTH = [
  "news", "talk", "sports", "classical", "jazz", "blues", "folk", "world", "reggae",
  "afrobeats", "amapiano", "highlife", "soukous", "salsa", "cumbia", "bachata",
  "reggaeton", "bollywood", "k-pop", "j-pop", "c-pop", "metal", "punk", "indie",
  "electronic", "ambient", "lofi", "gospel", "christian", "islamic", "buddhist",
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

export function buildRadioExpansionBatch11Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  // Obscure / newly checked stations (often missed by votes-desc crawls).
  for (const kind of ["lastcheck_asc", "votes_asc", "clicks_asc", "lastchange_asc"] as const) {
    queries.push({
      key: `radio_browser:${kind}:gap4`,
      kind,
      value: kind,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const codec of CODECS) {
    queries.push({
      key: `radio_browser:codec:${slug(codec)}:gap4`,
      kind: "codec",
      value: codec,
      categorySlug: "global",
      priority: 2,
    });
  }

  for (const bitrate of BITRATE_MINS) {
    queries.push({
      key: `radio_browser:bitrate:${bitrate}:gap4`,
      kind: "bitrate",
      value: bitrate,
      categorySlug: "global",
      priority: 2,
    });
  }

  for (const code of WEAK_COUNTRY_CODES) {
    queries.push({
      key: `radio_browser:country:${code.toLowerCase()}:gap4`,
      kind: "country",
      value: code,
      categorySlug: "world",
      priority: 1,
    });
    for (const tag of GENRE_DEPTH.slice(0, 12)) {
      queries.push({
        key: `radio_browser:combo:${code.toLowerCase()}:${slug(tag)}:gap4`,
        kind: "combo",
        value: `${code}|${tag}`,
        categorySlug: tag,
        priority: 3,
      });
    }
  }

  for (const name of RADIO_NAME_WORDS) {
    queries.push({
      key: `radio_browser:name:${slug(name)}:gap4`,
      kind: "name",
      value: name,
      categorySlug: "world",
      priority: 2,
    });
  }

  for (const tag of GENRE_DEPTH) {
    queries.push({
      key: `radio_browser:tag:${slug(tag)}:gap4-asc`,
      kind: "tag",
      value: tag,
      categorySlug: tag,
      priority: 3,
    });
  }

  return queries;
}
