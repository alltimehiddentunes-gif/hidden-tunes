import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Wave 3 — Language / community / university / indigenous / diaspora depth.
 */

const COMMUNITY_LANGUAGES = [
  "yoruba", "hausa", "igbo", "swahili", "amharic", "zulu", "xhosa", "afrikaans", "wolof",
  "twi", "somali", "tigrinya", "oromo", "shona", "lingala", "kikuyu", "luganda",
  "tamil", "telugu", "kannada", "malayalam", "marathi", "gujarati", "punjabi", "odia",
  "assamese", "nepali", "sinhala", "burmese", "khmer", "lao", "mongolian", "tibetan",
  "uyghur", "kazakh", "uzbek", "tajik", "turkmen", "kyrgyz", "georgian", "armenian",
  "azerbaijani", "kurdish", "pashto", "dari", "balochi", "sindhi",
  "quechua", "guarani", "aymara", "nahuatl", "maya", "mapudungun",
  "welsh", "irish", "scottish gaelic", "basque", "catalan", "galician", "occitan",
  "breton", "corsican", "sardinian", "friulian", "ladino", "yiddish", "romani",
  "maori", "samoan", "tongan", "fijian", "tahitian", "hawaiian",
  "inuktitut", "cree", "ojibwe", "cherokee",
] as const;

const COMMUNITY_TAGS = [
  "university", "university radio", "campus", "student radio", "college radio",
  "community", "community radio", "public radio", "public broadcasting",
  "indigenous", "native", "first nations", "aboriginal", "diaspora",
  "immigrant", "multicultural", "ethnic", "minority language", "local news",
  "religious", "gospel", "islamic", "catholic", "orthodox", "hindu", "buddhist",
  "church", "mosque", "temple", "nonprofit", "independent", "pirate radio",
] as const;

const DIASPORA_NAME_TERMS = [
  "community radio", "campus radio", "university FM", "student FM", "public radio",
  "diaspora radio", "ethnic radio", "multicultural radio", "indigenous radio",
  "aboriginal radio", "first nations radio", "native radio", "community FM",
] as const;

function slug(value: string) {
  return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

export function buildRadioExpansionBatch10Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const language of COMMUNITY_LANGUAGES) {
    queries.push({
      key: `radio_browser:bylanguage:${slug(language)}:wave3`,
      kind: "bylanguage",
      value: language,
      categorySlug: "community",
      priority: 1,
    });
    queries.push({
      key: `radio_browser:language:${slug(language)}:wave3`,
      kind: "language",
      value: language,
      categorySlug: "community",
      priority: 2,
    });
  }

  for (const tag of COMMUNITY_TAGS) {
    queries.push({
      key: `radio_browser:tag:${slug(tag)}:wave3`,
      kind: "tag",
      value: tag,
      categorySlug: slug(tag).slice(0, 80),
      priority: 1,
    });
  }

  for (const term of DIASPORA_NAME_TERMS) {
    queries.push({
      key: `radio_browser:name:${slug(term)}:wave3`,
      kind: "name",
      value: term,
      categorySlug: "community",
      priority: 1,
    });
  }

  // Language × community genre combos
  for (const language of ["spanish", "portuguese", "arabic", "hindi", "french", "swahili", "chinese", "turkish"]) {
    for (const tag of ["community", "news", "gospel", "university", "local"]) {
      queries.push({
        key: `radio_browser:lang_combo:${slug(language)}:${slug(tag)}:wave3`,
        kind: "lang_combo",
        value: `${language}|${tag}`,
        categorySlug: slug(tag),
        priority: 1,
      });
    }
  }

  const seen = new Set<string>();
  return queries
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))
    .filter((q) => {
      if (seen.has(q.key)) return false;
      seen.add(q.key);
      return true;
    });
}
