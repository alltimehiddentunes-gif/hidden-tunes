import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/** Wave 7 — codec/bitrate sweep + multilingual "radio" name variants for final gap closure. */

const NAME_VARIANTS = [
  "FM", "AM", "Radio", "rádió", "rádio", "radio", "радио", "راديو", "ραδιόφωνο",
  "radyo", "라디오", "ラジオ", "电台", "廣播", "วิทยุ", "रेडियो", "রেডিও", "رادیو",
  "radiostasija", "radiostacja", "radiostation", "radiokanava", "radiokanal",
  "emisora", "emissão", "emittente", "sender", "zender", "kanál", "kanal",
  "Live Radio", "Online Radio", "Internet Radio", "Web Radio", "Webradio",
  "Radio 1", "Radio 2", "Radio 3", "Radio 4", "Radio 5", "Radio 24", "Radio 105",
] as const;

const CODECS = ["MP3", "AAC", "AAC+", "OGG", "OPUS", "FLAC", "WMA", "HLS"] as const;
const BITRATES = ["24", "32", "40", "48", "56", "64", "80", "96", "112", "128", "160", "192", "224", "256", "320"] as const;

const LANGS = [
  "english", "spanish", "portuguese", "french", "german", "italian", "dutch", "polish",
  "russian", "ukrainian", "turkish", "arabic", "persian", "hindi", "bengali", "urdu",
  "indonesian", "malay", "thai", "vietnamese", "chinese", "japanese", "korean",
  "swahili", "hausa", "yoruba", "igbo", "amharic", "zulu", "afrikaans",
  "tagalog", "tamil", "telugu", "punjabi", "gujarati", "marathi", "nepali",
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

export function buildRadioExpansionBatch14Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const kind of ["lastcheck_asc", "votes_asc", "clicks_asc", "lastchange_asc", "name_order"] as const) {
    queries.push({
      key: `radio_browser:${kind}:wave7`,
      kind,
      value: kind,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const codec of CODECS) {
    queries.push({
      key: `radio_browser:codec:${slug(codec)}:wave7`,
      kind: "codec",
      value: codec,
      categorySlug: "global",
      priority: 2,
    });
  }

  for (const bitrate of BITRATES) {
    queries.push({
      key: `radio_browser:bitrate:${bitrate}:wave7`,
      kind: "bitrate",
      value: bitrate,
      categorySlug: "global",
      priority: 2,
    });
  }

  for (const name of NAME_VARIANTS) {
    queries.push({
      key: `radio_browser:name:${slug(name)}:wave7`,
      kind: "name",
      value: name,
      categorySlug: "world",
      priority: 2,
    });
  }

  for (const language of LANGS) {
    queries.push({
      key: `radio_browser:bylanguage:${slug(language)}:wave7`,
      kind: "bylanguage",
      value: language,
      categorySlug: "language",
      priority: 1,
    });
    for (const tag of ["news", "music", "talk", "community", "religious"] as const) {
      queries.push({
        key: `radio_browser:lang_combo:${slug(language)}:${tag}:wave7`,
        kind: "lang_combo",
        value: `${language}|${tag}`,
        categorySlug: tag,
        priority: 3,
      });
    }
  }

  return queries;
}
