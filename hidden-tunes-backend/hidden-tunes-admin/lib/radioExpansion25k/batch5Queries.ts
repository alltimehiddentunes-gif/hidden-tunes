import type { RadioExpansionQuery } from "@/lib/radioExpansion25k/sourceQueries";

const CODECS = ["MP3", "AAC", "AAC+", "OGG", "OPUS"] as const;

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
] as const;

const NAME_PREFIXES = [
  "radio", "fm", "am", "live", "music", "station", "stream", "hits", "mix", "beat", "wave",
  "sound", "voice", "news", "sport", "jazz", "rock", "pop", "classic", "gold", "star", "city",
  "local", "national", "world", "digital", "online", "net", "web", "club", "dance", "soul",
  "blues", "country", "gospel", "talk", "community", "university", "campus", "public",
] as const;

export function buildRadioExpansionBatch5Queries(): RadioExpansionQuery[] {
  const queries: RadioExpansionQuery[] = [];

  for (const codec of CODECS) {
    queries.push({
      key: `radio_browser:codec:${codec.toLowerCase()}`,
      kind: "codec",
      value: codec,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const state of US_STATES) {
    queries.push({
      key: `radio_browser:state:US:${state.toLowerCase().replace(/\s+/g, "-")}`,
      kind: "state",
      value: `US|${state}`,
      categorySlug: "global",
      priority: 1,
    });
  }

  for (const prefix of NAME_PREFIXES) {
    queries.push({
      key: `radio_browser:name:${prefix}`,
      kind: "name",
      value: prefix,
      categorySlug: "global",
      priority: 2,
    });
  }

  queries.push(
    {
      key: "radio_browser:global:name-asc",
      kind: "name_order",
      value: "name",
      categorySlug: "global",
      priority: 3,
    },
    {
      key: "radio_browser:global:clickcount-asc",
      kind: "clicks_asc",
      value: "clickcount",
      categorySlug: "global",
      priority: 3,
    }
  );

  return queries.sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));
}
