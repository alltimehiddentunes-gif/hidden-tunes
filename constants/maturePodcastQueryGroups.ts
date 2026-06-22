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
  group("dating", "Dating", [
    "dating advice",
    "modern dating",
    "singles",
    "dating stories",
    "dating app",
    "first dates",
    "dating podcast",
  ]),
  group("relationships", "Relationships", [
    "relationship advice",
    "toxic relationships",
    "love stories",
    "relationship problems",
    "couples talk",
    "relationships podcast",
    "love advice",
  ]),
  group("marriage", "Marriage", [
    "marriage advice",
    "married life",
    "divorce stories",
    "couples therapy",
    "marriage counseling",
    "marriage podcast",
  ]),
  group("sexual-health", "Sexual Health", [
    "sexual health",
    "intimacy",
    "sex education",
    "reproductive health",
    "relationships and intimacy",
    "sexual wellness podcast",
  ]),
  group("adult-psychology", "Adult Psychology", [
    "human behavior",
    "attachment styles",
    "trauma bonding",
    "desire",
    "intimacy psychology",
    "emotional intelligence",
    "adult psychology podcast",
  ]),
  group("after-dark", "After Dark", [
    "after dark podcast",
    "late night talk",
    "uncensored podcast",
    "taboo talk",
    "nightlife talk",
    "after hours podcast",
  ]),
  group("adult-comedy", "Adult Comedy", [
    "uncensored comedy",
    "adult comedy podcast",
    "comedy after dark",
    "stand up comedy podcast",
    "late night comedy podcast",
  ]),
  group("real-stories", "Real Stories", [
    "confessions podcast",
    "real life stories",
    "personal stories",
    "anonymous stories",
    "life experiences podcast",
    "true stories podcast",
  ]),
  group("unfiltered-interviews", "Unfiltered Interviews", [
    "unfiltered interviews",
    "uncensored interviews",
    "no filter podcast",
    "real talk podcast",
    "raw interviews podcast",
  ]),
  group("lifestyle-18", "Lifestyle 18+", [
    "adult lifestyle",
    "nightlife",
    "modern relationships",
    "lifestyle talk",
    "dating culture",
    "mature lifestyle podcast",
  ]),
  group("adult-talk", "Adult Talk", [
    "adult conversations",
    "mature conversations",
    "relationship talk",
    "late night conversations",
    "grown folk talk",
    "adult talk podcast",
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
