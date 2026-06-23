import { MAX_FALLBACK_QUERIES } from "../constants/discoveryPerformanceBudget";
import { shouldIncludeMatureInApi } from "./matureContentSettings";

export const MEDIA_SEARCH_MAX_ALIAS_QUERIES = MAX_FALLBACK_QUERIES;
export const MEDIA_SEARCH_MAX_FALLBACK_ATTEMPTS = MAX_FALLBACK_QUERIES;

export type MediaSearchExpansion = {
  canonical: string;
  aliases: string[];
  country?: string;
  countryCode?: string;
  tags: string[];
  podcastQueries: string[];
  matureAliases: string[];
  isMatureIntent: boolean;
};

type AliasGroup = {
  canonical: string;
  aliases: string[];
  country?: string;
  countryCode?: string;
  tags?: string[];
  podcastQueries?: string[];
  matureOnly?: boolean;
};

const ALIAS_GROUPS: AliasGroup[] = [
  {
    canonical: "ghana",
    aliases: ["ghanaian", "accra", "twi", "akan", "highlife", "afrobeats ghana"],
    country: "Ghana",
    countryCode: "GH",
    tags: ["ghana", "highlife", "afrobeats"],
    podcastQueries: ["ghana podcast", "ghanaian", "african voices", "accra"],
  },
  {
    canonical: "love",
    aliases: ["romance", "relationship", "relationships", "dating", "slow jams", "r&b"],
    tags: ["love", "romance", "r&b", "soul"],
    podcastQueries: ["love podcast", "relationships", "dating", "romance"],
    matureOnly: false,
  },
  {
    canonical: "gospel",
    aliases: ["worship", "christian", "praise", "faith", "sermons"],
    tags: ["gospel", "worship", "christian"],
    podcastQueries: ["gospel podcast", "worship", "christian faith"],
  },
  {
    canonical: "afrobeats",
    aliases: ["afrobeat", "amapiano", "highlife", "african music", "afro"],
    tags: ["afrobeats", "afrobeat", "amapiano", "african"],
    podcastQueries: ["afrobeats podcast", "african music", "amapiano"],
  },
  {
    canonical: "news",
    aliases: ["talk", "current affairs", "politics", "headlines"],
    tags: ["news", "talk", "politics"],
    podcastQueries: ["news podcast", "current affairs", "politics"],
  },
  {
    canonical: "sports",
    aliases: ["football", "soccer", "basketball", "athletics"],
    tags: ["sports", "football", "soccer"],
    podcastQueries: ["sports podcast", "football", "soccer"],
  },
  {
    canonical: "business",
    aliases: ["entrepreneurship", "startup", "finance", "money"],
    tags: ["business"],
    podcastQueries: ["business podcast", "entrepreneurship", "startup", "finance"],
  },
  {
    canonical: "health",
    aliases: ["wellness", "fitness", "mental health", "nutrition"],
    tags: ["health", "wellness"],
    podcastQueries: ["health podcast", "wellness", "mental health"],
  },
  {
    canonical: "comedy",
    aliases: ["humor", "standup", "funny"],
    tags: ["comedy", "humor"],
    podcastQueries: ["comedy podcast", "standup"],
  },
  {
    canonical: "faith",
    aliases: ["christian", "gospel", "worship", "sermons", "bible"],
    tags: ["christian", "gospel", "faith"],
    podcastQueries: ["faith podcast", "christian", "gospel"],
  },
  {
    canonical: "relationships",
    aliases: ["love", "dating", "marriage", "heartbreak", "romance"],
    tags: ["relationships", "love"],
    podcastQueries: ["relationships podcast", "dating", "marriage", "heartbreak"],
  },
  {
    canonical: "nigeria",
    aliases: ["nigerian", "lagos", "naija", "afrobeats"],
    country: "Nigeria",
    countryCode: "NG",
    tags: ["nigeria", "naija", "afrobeats"],
    podcastQueries: ["nigeria podcast", "nigerian", "lagos"],
  },
  {
    canonical: "kenya",
    aliases: ["kenyan", "nairobi", "bongo"],
    country: "Kenya",
    countryCode: "KE",
    tags: ["kenya", "bongo"],
    podcastQueries: ["kenya podcast", "kenyan", "african voices"],
  },
];

const MATURE_ALIAS_GROUPS: AliasGroup[] = [
  {
    canonical: "dating",
    aliases: ["dating advice", "modern dating", "singles", "first dates", "dating app"],
    tags: ["dating", "relationships"],
    podcastQueries: ["dating podcast", "modern dating podcast", "singles podcast"],
    matureOnly: true,
  },
  {
    canonical: "relationships",
    aliases: ["romance", "couples", "love advice", "relationship advice", "couples talk"],
    tags: ["relationships", "romance"],
    podcastQueries: ["relationships podcast", "couples podcast", "love advice podcast"],
    matureOnly: true,
  },
  {
    canonical: "marriage",
    aliases: ["married life", "couples therapy", "marriage counseling", "partnership"],
    podcastQueries: ["marriage podcast", "marriage advice podcast"],
    matureOnly: true,
  },
  {
    canonical: "breakups",
    aliases: ["divorce", "breakup", "separation", "heartbreak", "moving on"],
    podcastQueries: ["breakup podcast", "divorce podcast"],
    matureOnly: true,
  },
  {
    canonical: "sexual health",
    aliases: ["intimacy", "sex education", "sexual wellness", "reproductive health"],
    tags: ["health", "intimacy"],
    podcastQueries: ["sexual health podcast", "intimacy podcast"],
    matureOnly: true,
  },
  {
    canonical: "psychology",
    aliases: ["adult psychology", "human behavior", "attachment styles", "emotional intelligence"],
    podcastQueries: ["psychology podcast", "human behavior podcast"],
    matureOnly: true,
  },
  {
    canonical: "confessions",
    aliases: ["anonymous stories", "secrets", "true confessions", "personal confessions"],
    podcastQueries: ["confessions podcast", "anonymous stories podcast"],
    matureOnly: true,
  },
  {
    canonical: "after dark",
    aliases: ["late night talk", "unfiltered talk", "nightlife", "after hours"],
    tags: ["after dark", "late night"],
    podcastQueries: ["after dark podcast", "late night talk podcast"],
    matureOnly: true,
  },
  {
    canonical: "adult comedy",
    aliases: ["uncensored comedy", "late night comedy", "comedy after dark"],
    podcastQueries: ["adult comedy podcast", "uncensored comedy podcast"],
    matureOnly: true,
  },
  {
    canonical: "real stories",
    aliases: ["personal stories", "life stories", "true stories", "real life stories"],
    podcastQueries: ["real stories podcast", "personal stories podcast"],
    matureOnly: true,
  },
  {
    canonical: "lgbtq",
    aliases: ["queer", "gay podcast", "lesbian podcast", "LGBTQ relationships", "pride"],
    podcastQueries: ["LGBTQ podcast", "queer podcast"],
    matureOnly: true,
  },
  {
    canonical: "mature",
    aliases: ["adult", "18+", "after dark", "intimacy", "unfiltered"],
    tags: ["mature", "adult"],
    podcastQueries: ["mature podcast", "adult podcast"],
    matureOnly: true,
  },
];

export const RADIO_SEARCH_SUGGESTIONS = [
  "Ghana",
  "Gospel",
  "Afrobeats",
  "Worship",
  "News",
  "Sports",
  "Love",
  "Amapiano",
] as const;

export const PODCAST_SEARCH_SUGGESTIONS = [
  "Relationships",
  "Business",
  "Faith",
  "African Voices",
  "Health",
  "Comedy",
  "True Crime",
] as const;

export const PODCAST_MATURE_SEARCH_SUGGESTION = "Mature 18+";

function normalizeSearchToken(query: string) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s+&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchingGroup(token: string, groups: AliasGroup[]) {
  const exact = groups.find((group) => group.canonical === token);
  if (exact) return exact;

  return groups.find((group) => {
    if (token.includes(group.canonical) || group.canonical.includes(token)) return true;
    return group.aliases.some(
      (alias) => token.includes(alias) || alias.includes(token) || token === alias
    );
  });
}

function uniqueStrings(values: string[], max: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= max) break;
  }

  return result;
}

export function resolveMediaSearchExpansion(
  query: string,
  options?: { includeMature?: boolean }
): MediaSearchExpansion {
  const includeMature = options?.includeMature ?? shouldIncludeMatureInApi();
  const token = normalizeSearchToken(query);
  const standardGroup = findMatchingGroup(token, ALIAS_GROUPS);
  const matureGroup = includeMature ? findMatchingGroup(token, MATURE_ALIAS_GROUPS) : undefined;
  const group = matureGroup?.matureOnly ? matureGroup : standardGroup || matureGroup;

  const canonical = group?.canonical || token;
  const aliases = uniqueStrings(
    [token, canonical, ...(group?.aliases || []), ...(includeMature && matureGroup ? matureGroup.aliases : [])],
    MEDIA_SEARCH_MAX_ALIAS_QUERIES + 1
  ).filter((value) => value !== token);

  const tags = uniqueStrings([token, canonical, ...(group?.tags || [])], MEDIA_SEARCH_MAX_ALIAS_QUERIES);
  const podcastQueries = uniqueStrings(
    [token, `${token} podcast`, ...(group?.podcastQueries || []), ...aliases.map((alias) => `${alias} podcast`)],
    MEDIA_SEARCH_MAX_ALIAS_QUERIES + 1
  );

  const matureAliases = includeMature
    ? uniqueStrings(
        matureGroup
          ? [matureGroup.canonical, ...matureGroup.aliases, ...matureGroup.podcastQueries || []]
          : [],
        MEDIA_SEARCH_MAX_ALIAS_QUERIES
      )
    : [];

  return {
    canonical,
    aliases,
    country: group?.country,
    countryCode: group?.countryCode,
    tags,
    podcastQueries,
    matureAliases,
    isMatureIntent: Boolean(includeMature && (matureGroup?.matureOnly || matureAliases.length > 0)),
  };
}

export type RadioSearchStrategy =
  | { kind: "name"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "country"; value: string }
  | { kind: "countrycode"; value: string }
  | { kind: "language"; value: string };

export function buildRadioSearchStrategies(
  query: string,
  options?: { includeMature?: boolean }
): RadioSearchStrategy[] {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) return [];

  const includeMature = options?.includeMature ?? shouldIncludeMatureInApi();
  const expansion = resolveMediaSearchExpansion(safeQuery, { includeMature });
  const strategies: RadioSearchStrategy[] = [{ kind: "name", value: safeQuery }];

  if (expansion.country) {
    strategies.push({ kind: "country", value: expansion.country });
  }

  if (expansion.countryCode) {
    strategies.push({ kind: "countrycode", value: expansion.countryCode });
  }

  for (const tag of expansion.tags) {
    if (tag.toLowerCase() === safeQuery.toLowerCase()) continue;
    strategies.push({ kind: "tag", value: tag });
  }

  for (const alias of expansion.aliases) {
    strategies.push({ kind: "name", value: alias });
  }

  if (includeMature && expansion.isMatureIntent) {
    for (const alias of expansion.matureAliases) {
      strategies.push({ kind: "tag", value: alias });
    }
  }

  const seen = new Set<string>();
  const deduped: RadioSearchStrategy[] = [];

  for (const strategy of strategies) {
    const key = `${strategy.kind}:${strategy.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(strategy);
    if (deduped.length >= MEDIA_SEARCH_MAX_FALLBACK_ATTEMPTS) break;
  }

  return deduped;
}

export function buildPodcastSearchQueries(
  query: string,
  options?: { includeMature?: boolean }
): string[] {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) return [];

  const includeMature = options?.includeMature ?? shouldIncludeMatureInApi();
  const expansion = resolveMediaSearchExpansion(safeQuery, { includeMature });

  const queries = uniqueStrings(
    [
      safeQuery,
      safeQuery.toLowerCase().endsWith("podcast") ? "" : `${safeQuery} podcast`,
      ...expansion.podcastQueries,
      ...expansion.aliases,
      ...(includeMature ? expansion.matureAliases : []),
    ],
    MEDIA_SEARCH_MAX_FALLBACK_ATTEMPTS
  );

  return queries;
}

export function getRadioSearchSuggestions(includeMature = shouldIncludeMatureInApi()) {
  return [...RADIO_SEARCH_SUGGESTIONS];
}

export function getPodcastSearchSuggestions(includeMature = shouldIncludeMatureInApi()): string[] {
  const suggestions: string[] = [...PODCAST_SEARCH_SUGGESTIONS];
  if (includeMature) {
    suggestions.push(PODCAST_MATURE_SEARCH_SUGGESTION);
  }
  return suggestions;
}
