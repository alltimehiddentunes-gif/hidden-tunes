import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

const COUNTRY_NAMES = [
  "India", "Nigeria", "Pakistan", "Philippines", "Kenya", "Ghana", "Bangladesh", "Vietnam",
  "Malaysia", "Colombia", "Peru", "Chile", "Ecuador", "Tanzania", "Uganda", "Senegal",
  "Ivory Coast", "Cameroon", "Ethiopia", "Morocco", "Tunisia", "Algeria", "Egypt", "Jordan",
  "Lebanon", "Serbia", "Croatia", "Bosnia And Herzegovina", "North Macedonia", "Albania",
  "Indonesia", "Thailand", "Myanmar", "Nepal", "Sri Lanka", "Afghanistan", "Angola",
  "Mozambique", "Zambia", "Zimbabwe", "Rwanda", "Bolivia", "Paraguay", "Uruguay",
  "Guatemala", "Honduras", "Nicaragua", "Costa Rica", "Panama", "Dominican Republic",
  "Jamaica", "Trinidad And Tobago", "Australia", "New Zealand", "Ireland", "Portugal",
  "Romania", "Bulgaria", "Hungary", "Czechia", "Slovakia", "Slovenia", "Lithuania",
  "Latvia", "Estonia", "Iceland", "Finland", "Norway", "Denmark", "Belgium", "Austria",
  "Switzerland", "Greece", "Turkey", "Ukraine", "Belarus", "Moldova", "Georgia", "Armenia",
  "Azerbaijan", "Kazakhstan", "Uzbekistan", "Mongolia", "Cambodia", "Laos",
] as const;

const AU_STATES = [
  "New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia",
  "Tasmania", "Northern Territory", "Australian Capital Territory",
] as const;

const DE_STATES = [
  "Bayern", "Baden-Württemberg", "Nordrhein-Westfalen", "Niedersachsen", "Hessen",
  "Sachsen", "Berlin", "Hamburg", "Schleswig-Holstein", "Rheinland-Pfalz",
] as const;

const MX_STATES = [
  "Jalisco", "Nuevo Leon", "Chihuahua", "Sonora", "Veracruz", "Puebla", "Guerrero",
  "Oaxaca", "Yucatan", "Baja California",
] as const;

const LANG_COMBO = [
  { language: "hindi", tag: "bollywood" },
  { language: "hindi", tag: "news" },
  { language: "hindi", tag: "music" },
  { language: "spanish", tag: "latin" },
  { language: "spanish", tag: "news" },
  { language: "spanish", tag: "pop" },
  { language: "portuguese", tag: "brazilian" },
  { language: "portuguese", tag: "news" },
  { language: "arabic", tag: "news" },
  { language: "arabic", tag: "music" },
  { language: "swahili", tag: "news" },
  { language: "swahili", tag: "gospel" },
  { language: "french", tag: "african" },
  { language: "french", tag: "news" },
  { language: "german", tag: "news" },
  { language: "german", tag: "pop" },
  { language: "italian", tag: "pop" },
  { language: "italian", tag: "news" },
  { language: "turkish", tag: "pop" },
  { language: "turkish", tag: "news" },
  { language: "indonesian", tag: "pop" },
  { language: "indonesian", tag: "news" },
  { language: "tagalog", tag: "pop" },
  { language: "tagalog", tag: "news" },
  { language: "bengali", tag: "news" },
  { language: "bengali", tag: "music" },
  { language: "polish", tag: "news" },
  { language: "polish", tag: "pop" },
  { language: "russian", tag: "pop" },
  { language: "russian", tag: "news" },
] as const;

const BY_LANGUAGE = [
  "swahili", "amharic", "yoruba", "hausa", "zulu", "afrikaans", "tagalog", "tamil",
  "telugu", "marathi", "gujarati", "punjabi", "nepali", "sinhala", "burmese", "khmer",
  "lao", "mongolian", "kazakh", "uzbek", "georgian", "armenian", "azerbaijani",
  "serbian", "croatian", "bosnian", "slovak", "slovenian", "bulgarian", "albanian",
  "macedonian", "latvian", "lithuanian", "estonian", "icelandic", "welsh", "irish",
  "basque", "catalan", "galician", "malagasy", "somali", "kurdish",
] as const;

export function buildRadioExpansionBatch7Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const country of COUNTRY_NAMES) {
    queries.push({
      key: `radio_browser:country_name:${country.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "country_name",
      value: country,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const state of AU_STATES) {
    queries.push({
      key: `radio_browser:state:AU:${state.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "state",
      value: `AU|${state}`,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const state of DE_STATES) {
    queries.push({
      key: `radio_browser:state:DE:${state.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "state",
      value: `DE|${state}`,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const state of MX_STATES) {
    queries.push({
      key: `radio_browser:state:MX:${state.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "state",
      value: `MX|${state}`,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const combo of LANG_COMBO) {
    queries.push({
      key: `radio_browser:lang_combo:${combo.language}:${combo.tag}`,
      kind: "lang_combo",
      value: `${combo.language}|${combo.tag}`,
      categorySlug: combo.tag,
      priority: 2,
    });
  }

  for (const language of BY_LANGUAGE) {
    queries.push({
      key: `radio_browser:bylanguage:${language}`,
      kind: "bylanguage",
      value: language,
      categorySlug: "global",
      priority: 2,
    });
  }

  queries.push(
    {
      key: "radio_browser:global:lastchange-asc",
      kind: "lastchange_asc",
      value: "lastchange",
      categorySlug: "global",
      priority: 3,
    },
    {
      key: "radio_browser:global:lastcheck-asc",
      kind: "lastcheck_asc",
      value: "lastchecktime",
      categorySlug: "global",
      priority: 3,
    }
  );

  return queries.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
}
