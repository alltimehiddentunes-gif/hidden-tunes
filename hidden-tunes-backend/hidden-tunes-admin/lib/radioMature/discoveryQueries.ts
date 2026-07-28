import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";
import { buildRadioBrowserPath } from "@/lib/radioExpansion25k/sourceQueries";

/**
 * Deep worldwide mature (+18) discovery queries for Radio Browser.
 * Includes English + major local-language adult/uncensored/nightlife terms,
 * country×name combinations, and explicit music / comedy / talk tags.
 */

const MATURE_TAGS = [
  "erotic",
  "erotica",
  "sensual",
  "asmr",
  "explicit",
  "explicit talk",
  "adult entertainment",
  "phone sex",
  "nsfw",
  "fetish",
  "swinger",
  "kink",
  "uncensored",
  "18+",
  "+18",
  "sex",
  "adult lifestyle",
  "adult",
  "porn",
  "xxx",
  "sexy",
  "nightlife",
  "club",
  "clubbing",
  "after dark",
  "late night",
  "explicit hip hop",
  "explicit rap",
  "uncensored hip hop",
  "uncensored rap",
  "uncensored comedy",
  "adult talk",
  "sex talk",
  "relationship",
  "lgbt",
  "lgbtq",
  "gay",
  "lesbian",
  "pride",
  "dirty",
  "strip club",
  "afterhours",
  "after hours",
  "midnight",
  "red light",
  "erotica talk",
  "sex sounds",
  "sex sound",
  "adult comedy",
  "dirty comedy",
  "hot talk",
  "shock jock",
  "freeform adult",
] as const;

const MATURE_NAME_SEARCHES = [
  // English
  "erotic",
  "erotica",
  "sex sound",
  "sex radio",
  "adult talk",
  "phone sex",
  "explicit talk",
  "sex talk",
  "full swap",
  "asmr",
  "swinger",
  "fetish",
  "nsfw",
  "18+",
  "adult entertainment",
  "adult radio",
  "mature radio",
  "explicit radio",
  "uncensored radio",
  "uncensored",
  "nightlife radio",
  "club radio",
  "explicit hip hop",
  "explicit rap",
  "uncensored comedy",
  "sex positive",
  "relationship radio",
  "erotic audio",
  "adult comedy",
  "hot talk",
  "after dark",
  // Spanish
  "radio erotica",
  "radio erótica",
  "radio adulta",
  "radio +18",
  "radio sexy",
  "radio nocturna",
  "radio club",
  "radio sensual",
  // Portuguese
  "rádio erótica",
  "radio erotica",
  "rádio adulta",
  "radio adulta",
  "rádio sexy",
  "radio +18",
  // French
  "radio érotique",
  "radio erotique",
  "radio adulte",
  "radio sexy",
  "radio coquine",
  "radio libertine",
  // German
  "erotik radio",
  "erotikradio",
  "sex radio",
  "adult radio",
  "fkk radio",
  "swinger radio",
  // Italian
  "radio erotica",
  "radio erótica",
  "radio sexy",
  "radio adulti",
  // Dutch
  "erotische radio",
  "sex radio",
  "nacht radio",
  // Russian
  "эротика",
  "эротическое радио",
  "секс радио",
  "для взрослых",
  // Polish
  "radio erotyczne",
  "seks radio",
  "dla dorosłych",
  // Turkish
  "erotik radyo",
  "seks radyo",
  "yetişkin radyo",
  // Arabic
  "راديو للكبار",
  "راديو إباحي",
  // Hindi
  "adult radio",
  "सेक्स रेडियो",
  // Japanese
  "エロラジオ",
  "アダルトラジオ",
  // Korean
  "성인 라디오",
  "에로 라디오",
  // Chinese
  "成人电台",
  "情色电台",
  // Swedish / Nordic
  "erotisk radio",
  "vuxen radio",
  // Greek
  "ερωτικό ραδιόφωνο",
  // Romanian
  "radio erotic",
  "radio pentru adulti",
] as const;

const MATURE_COUNTRY_FOCUS = [
  "US", "GB", "DE", "FR", "ES", "IT", "BR", "MX", "AR", "CO", "CL", "PE", "NL", "BE", "AT", "CH",
  "PL", "CZ", "SE", "NO", "DK", "FI", "PT", "GR", "TR", "RU", "UA", "AU", "CA", "NZ", "ZA", "NG",
  "KE", "GH", "IN", "JP", "KR", "TH", "PH", "ID", "MY", "SG", "AE", "IL", "PR", "DO", "CU", "VE",
] as const;

const COUNTRY_COMBO_TAGS = [
  "adult",
  "erotic",
  "erotica",
  "sexy",
  "uncensored",
  "explicit",
  "18+",
  "nightlife",
  "club",
  "sex",
  "nsfw",
  "porn",
  "xxx",
  "asmr",
  "lgbt",
  "lgbtq",
] as const;

export function buildMatureRadioDiscoveryQueries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];
  const seen = new Set<string>();

  const push = (query: RadioExpansionQuery) => {
    if (seen.has(query.key)) return;
    seen.add(query.key);
    queries.push(query);
  };

  for (const tag of MATURE_TAGS) {
    push({
      key: `radio_browser_mature:tag:${tag.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "tag",
      value: tag,
      categorySlug: "mature",
      priority: 1,
    });
  }

  for (const name of MATURE_NAME_SEARCHES) {
    push({
      key: `radio_browser_mature:name:${name.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "name",
      value: name,
      categorySlug: "mature",
      priority: 2,
    });
  }

  for (const country of MATURE_COUNTRY_FOCUS) {
    for (const tag of COUNTRY_COMBO_TAGS) {
      push({
        key: `radio_browser_mature:combo:${country.toLowerCase()}:${tag.toLowerCase().replace(/\s+/g, "-")}`,
        kind: "combo",
        value: `${country}|${tag}`,
        categorySlug: "mature",
        priority: 3,
      });
    }
  }

  return queries;
}

export function buildMatureRadioBrowserPath(
  query: RadioExpansionQuery,
  limit: number,
  offset: number
) {
  return buildRadioBrowserPath(query, limit, offset);
}
