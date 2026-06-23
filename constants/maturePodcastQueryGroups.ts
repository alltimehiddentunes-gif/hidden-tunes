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
    "dating",
    "dating advice",
    "modern dating",
    "singles",
    "relationships",
    "first dates",
    "dating app",
  ]),
  group("relationships", "Relationships", [
    "relationships",
    "romance",
    "couples",
    "love advice",
    "marriage",
    "relationship advice",
    "couples talk",
  ]),
  group("marriage", "Marriage", [
    "marriage",
    "marriage advice",
    "married life",
    "couples therapy",
    "marriage counseling",
    "partnership podcast",
  ]),
  group("breakups-divorce", "Breakups & Divorce", [
    "breakup podcast",
    "divorce stories",
    "breakups",
    "separation",
    "moving on",
    "heartbreak recovery",
  ]),
  group("sexual-health", "Sexual Health", [
    "sexual health",
    "intimacy",
    "sex education",
    "relationships",
    "communication",
    "reproductive health",
    "sexual wellness",
  ]),
  group("intimacy-communication", "Intimacy & Communication", [
    "intimacy",
    "communication",
    "relationship communication",
    "emotional intimacy",
    "couples communication",
    "connection podcast",
  ]),
  group("adult-psychology", "Adult Psychology", [
    "psychology",
    "human behavior",
    "attachment styles",
    "emotional intelligence",
    "relationships",
    "adult psychology",
    "therapy talk",
  ]),
  group("human-behavior", "Human Behavior", [
    "human behavior",
    "behavior psychology",
    "social psychology",
    "why we do",
    "mind and behavior",
    "human nature podcast",
  ]),
  group("love-advice", "Love Advice", [
    "love advice",
    "love podcast",
    "romance advice",
    "dating advice",
    "relationship tips",
    "modern love",
  ]),
  group("relationship-therapy", "Relationship Therapy", [
    "relationship therapy",
    "couples therapy",
    "marriage counseling",
    "therapy for couples",
    "relationship coach",
    "relationship repair",
  ]),
  group("mens-issues", "Men's Issues", [
    "men's issues",
    "modern manhood",
    "men and relationships",
    "masculinity podcast",
    "men's mental health",
    "guy talk podcast",
  ]),
  group("womens-issues", "Women's Issues", [
    "women's issues",
    "women and relationships",
    "feminine energy",
    "women's health podcast",
    "modern womanhood",
    "she talks podcast",
  ]),
  group("lgbtq-conversations", "LGBTQ+ Conversations", [
    "LGBTQ podcast",
    "queer podcast",
    "gay podcast",
    "lesbian podcast",
    "LGBTQ relationships",
    "pride podcast",
  ]),
  group("adult-comedy", "Adult Comedy", [
    "adult comedy",
    "uncensored comedy",
    "late night comedy",
    "comedy podcast",
    "stand up comedy podcast",
    "comedy after dark",
  ]),
  group("confessions", "Confessions", [
    "confessions",
    "confessions podcast",
    "anonymous stories",
    "secrets podcast",
    "true confessions",
    "personal confessions",
  ]),
  group("real-stories", "Real Stories", [
    "real stories",
    "personal stories",
    "life stories",
    "true stories podcast",
    "real life stories",
    "anonymous stories",
  ]),
  group("after-dark-conversations", "After Dark Conversations", [
    "after dark",
    "late night talk",
    "unfiltered talk",
    "nightlife",
    "after hours podcast",
    "taboo talk",
  ]),
  group("lifestyle-18", "Lifestyle 18+", [
    "adult lifestyle",
    "nightlife",
    "modern relationships",
    "dating culture",
    "lifestyle talk",
    "mature lifestyle podcast",
  ]),
  group("late-night-talk", "Late Night Talk", [
    "late night talk",
    "late night podcast",
    "after dark conversations",
    "midnight talk",
    "night talk show",
    "grown folk talk",
  ]),
  group("unfiltered-interviews", "Unfiltered Interviews", [
    "unfiltered interviews",
    "uncensored interviews",
    "no filter podcast",
    "real talk podcast",
    "raw interviews",
    "honest conversations",
  ]),
];

const GROUP_BY_ID = new Map(MATURE_PODCAST_QUERY_GROUPS.map((entry) => [entry.id, entry]));

/** Maps mature category ids (after stripping `mature-`) to query group ids. */
const CATEGORY_GROUP_ALIASES: Record<string, string> = {
  "adult-talk": "late-night-talk",
  "after-dark": "after-dark-conversations",
  "adult-psychology": "adult-psychology",
  "sexual-health": "sexual-health",
  "real-stories": "real-stories",
  "lifestyle-18": "lifestyle-18",
};

export function getMaturePodcastQueryGroup(id: string) {
  return GROUP_BY_ID.get(String(id || "").trim()) || null;
}

export function resolveMaturePodcastQueryGroupId(categoryId: string) {
  let safe = String(categoryId || "").trim();
  if (safe.startsWith("mature-")) {
    safe = safe.slice("mature-".length);
  }
  return CATEGORY_GROUP_ALIASES[safe] || safe;
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

export function getAllMaturePodcastQueryGroupIds() {
  return MATURE_PODCAST_QUERY_GROUPS.map((group) => group.id);
}
