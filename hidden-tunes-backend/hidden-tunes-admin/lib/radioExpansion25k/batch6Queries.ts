import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

const CA_PROVINCES = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
  "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan",
] as const;

const COMBO_COUNTRIES = [
  "IN", "NG", "PK", "PH", "KE", "GH", "BD", "VN", "MY", "CO", "PE", "CL", "EC", "TZ", "UG",
  "SN", "CI", "CM", "ET", "MA", "TN", "DZ", "EG", "JO", "LB", "RS", "HR", "BA", "MK", "AL",
] as const;

const COMBO_TAGS = [
  "news", "pop", "community", "talk", "gospel", "folk", "world", "sports", "jazz", "rock",
  "country", "latin", "reggae", "classical", "christian", "university", "local", "regional",
] as const;

const BITRATES = [64, 96, 128, 192, 256, 320] as const;

export function buildRadioExpansionBatch6Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const province of CA_PROVINCES) {
    queries.push({
      key: `radio_browser:state:CA:${province.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "state",
      value: `CA|${province}`,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const country of COMBO_COUNTRIES) {
    for (const tag of COMBO_TAGS) {
      queries.push({
        key: `radio_browser:combo:${country}:${tag}`,
        kind: "combo",
        value: `${country}|${tag}`,
        categorySlug: tag,
        priority: 1,
      });
    }
  }

  for (const bitrate of BITRATES) {
    queries.push({
      key: `radio_browser:bitrate:${bitrate}`,
      kind: "bitrate",
      value: String(bitrate),
      categorySlug: "global",
      priority: 2,
    });
  }

  queries.push(
    {
      key: "radio_browser:global:votes-asc",
      kind: "votes_asc",
      value: "votes",
      categorySlug: "global",
      priority: 3,
    },
    {
      key: "radio_browser:global:lastchecktime",
      kind: "lastcheck",
      value: "lastchecktime",
      categorySlug: "global",
      priority: 3,
    }
  );

  return queries.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
}
