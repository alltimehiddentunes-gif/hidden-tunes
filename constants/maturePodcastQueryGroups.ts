import type { PodcastShowsQuery } from "../services/podcastCatalogApi";

export type MaturePodcastQueryGroup = {
  id: string;
  title: string;
  keywords: string[];
  primaryQuery: string;
};

function group(
  id: string,
  title: string,
  keywords: string[]
): MaturePodcastQueryGroup {
  const primary = keywords[0] || title;
  return {
    id,
    title,
    keywords,
    primaryQuery: `${primary} podcast`,
  };
}

export const MATURE_PODCAST_QUERY_GROUPS: MaturePodcastQueryGroup[] = [
  group("dating", "Dating", ["dating", "singles", "modern dating", "dating advice"]),
  group("relationships", "Relationships", [
    "relationships",
    "love",
    "couples",
    "romance",
    "relationship advice",
  ]),
  group("marriage", "Marriage", [
    "marriage",
    "couples therapy",
    "married life",
    "divorce",
  ]),
  group("sexual-health", "Sexual Health", [
    "sexual health",
    "sex education",
    "intimacy",
    "safe sex",
  ]),
  group("adult-psychology", "Adult Psychology", [
    "adult psychology",
    "human behavior",
    "intimacy",
    "desire",
  ]),
  group("after-dark", "After Dark", [
    "after dark",
    "late night talk",
    "unfiltered",
    "taboo",
  ]),
  group("adult-comedy", "Adult Comedy", [
    "adult comedy",
    "uncensored comedy",
    "late night comedy",
  ]),
  group("real-stories", "Real Stories", [
    "confessions",
    "real stories",
    "personal stories",
    "life stories",
  ]),
  group("unfiltered-interviews", "Unfiltered Interviews", [
    "uncensored interviews",
    "unfiltered talk",
    "adult conversations",
  ]),
  group("lifestyle-18", "Lifestyle 18+", [
    "adult lifestyle",
    "mature lifestyle",
    "relationships",
    "nightlife",
  ]),
  group("adult-talk", "Adult Talk", [
    "adult talk",
    "mature conversations",
    "grown up talk",
    "explicit talk",
  ]),
];

const GROUP_BY_ID = new Map(MATURE_PODCAST_QUERY_GROUPS.map((entry) => [entry.id, entry]));

export function getMaturePodcastQueryGroup(id: string) {
  return GROUP_BY_ID.get(String(id || "").trim()) || null;
}

export function resolveMaturePodcastQueryGroupId(categoryId: string) {
  const safe = String(categoryId || "").trim();
  if (safe.startsWith("mature-")) {
    return safe.slice("mature-".length);
  }
  return safe;
}

export function buildMaturePodcastKeywordQuery(
  keyword: string,
  page = 1,
  limit = 40
): PodcastShowsQuery {
  const phrase = String(keyword || "").trim();
  return {
    q: phrase.includes("podcast") ? phrase : `${phrase} podcast`,
    page,
    limit,
    includeMature: true,
  };
}

export function countMaturePodcastKeywordSlots() {
  return MATURE_PODCAST_QUERY_GROUPS.reduce((sum, group) => sum + group.keywords.length, 0);
}
