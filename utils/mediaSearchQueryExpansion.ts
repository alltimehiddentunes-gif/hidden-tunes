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
  matureAliases: string[];
  isMatureIntent: boolean;
};

type AliasGroup = {
  canonical: string;
  aliases: string[];
  country?: string;
  countryCode?: string;
  tags?: string[];
  matureOnly?: boolean;
};

const ALIAS_GROUPS: AliasGroup[] = [
  {
    canonical: "ghana",
    aliases: ["ghanaian", "accra", "twi", "akan", "highlife", "afrobeats ghana"],
    country: "Ghana",
    countryCode: "GH",
    tags: ["ghana", "highlife", "afrobeats"],
  },
  {
    canonical: "love",
    aliases: ["romance", "relationship", "relationships", "dating", "slow jams", "r&b"],
    tags: ["love", "romance", "r&b", "soul"],
  },
  {
    canonical: "gospel",
    aliases: ["worship", "christian", "praise", "faith", "sermons"],
    tags: ["gospel", "worship", "christian"],
  },
  {
    canonical: "afrobeats",
    aliases: ["afrobeat", "amapiano", "highlife", "african music", "afro"],
    tags: ["afrobeats", "afrobeat", "amapiano", "african"],
  },
  {
    canonical: "news",
    aliases: ["talk", "current affairs", "politics", "headlines"],
    tags: ["news", "talk", "politics"],
  },
  {
    canonical: "sports",
    aliases: ["football", "soccer", "basketball", "athletics"],
    tags: ["sports", "football", "soccer"],
  },
  {
    canonical: "business",
    aliases: ["entrepreneurship", "startup", "finance", "money"],
    tags: ["business"],
  },
  {
    canonical: "health",
    aliases: ["wellness", "fitness", "mental health", "nutrition"],
    tags: ["health", "wellness"],
  },
  {
    canonical: "comedy",
    aliases: ["humor", "standup", "funny"],
    tags: ["comedy", "humor"],
  },
  {
    canonical: "faith",
    aliases: ["christian", "gospel", "worship", "sermons", "bible"],
    tags: ["christian", "gospel", "faith"],
  },
  {
    canonical: "relationships",
    aliases: ["love", "dating", "marriage", "heartbreak", "romance"],
    tags: ["relationships", "love"],
  },
  {
    canonical: "nigeria",
    aliases: ["nigerian", "lagos", "naija", "afrobeats"],
    country: "Nigeria",
    countryCode: "NG",
    tags: ["nigeria", "naija", "afrobeats"],
  },
  {
    canonical: "kenya",
    aliases: ["kenyan", "nairobi", "bongo"],
    country: "Kenya",
    countryCode: "KE",
    tags: ["kenya", "bongo"],
  },
];

const MATURE_ALIAS_GROUPS: AliasGroup[] = [
  {
    canonical: "dating",
    aliases: ["dating advice", "modern dating", "singles", "first dates", "dating app"],
    tags: ["dating", "relationships"],
    matureOnly: true,
  },
  {
    canonical: "relationships",
    aliases: ["romance", "couples", "love advice", "relationship advice", "couples talk"],
    tags: ["relationships", "romance"],
    matureOnly: true,
  },
  {
    canonical: "marriage",
    aliases: ["married life", "couples therapy", "marriage counseling", "partnership"],
    matureOnly: true,
  },
  {
    canonical: "breakups",
    aliases: ["divorce", "breakup", "separation", "heartbreak", "moving on"],
    matureOnly: true,
  },
  {
    canonical: "sexual health",
    aliases: ["intimacy", "sex education", "sexual wellness", "reproductive health"],
    tags: ["health", "intimacy"],
    matureOnly: true,
  },
  {
    canonical: "psychology",
    aliases: ["adult psychology", "human behavior", "attachment styles", "emotional intelligence"],
    matureOnly: true,
  },
  {
    canonical: "confessions",
    aliases: ["anonymous stories", "secrets", "true confessions", "personal confessions"],
    matureOnly: true,
  },
  {
    canonical: "after dark",
    aliases: ["late night talk", "unfiltered talk", "nightlife", "after hours"],
    tags: ["after dark", "late night"],
    matureOnly: true,
  },
  {
    canonical: "adult comedy",
    aliases: ["uncensored comedy", "late night comedy", "comedy after dark"],
    matureOnly: true,
  },
  {
    canonical: "real stories",
    aliases: ["personal stories", "life stories", "true stories", "real life stories"],
    matureOnly: true,
  },
  {
    canonical: "lgbtq",
    aliases: ["queer", "gay talk", "lesbian talk", "LGBTQ relationships", "pride"],
    matureOnly: true,
  },
  {
    canonical: "mature",
    aliases: ["adult", "18+", "after dark", "intimacy", "unfiltered"],
    tags: ["mature", "adult"],
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

  const matureAliases = includeMature
    ? uniqueStrings(
        matureGroup ? [matureGroup.canonical, ...matureGroup.aliases] : [],
        MEDIA_SEARCH_MAX_ALIAS_QUERIES
      )
    : [];

  return {
    canonical,
    aliases,
    country: group?.country,
    countryCode: group?.countryCode,
    tags,
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

export function getRadioSearchSuggestions(_includeMature = shouldIncludeMatureInApi()) {
  return [...RADIO_SEARCH_SUGGESTIONS];
}
