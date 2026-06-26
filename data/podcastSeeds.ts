import type { PodcastSeed } from "../types/podcast";

// Large-scale podcast ingestion belongs in backend/admin pipeline, not the mobile bundle.

export const GENERAL_PODCAST_FEEDS: PodcastSeed[] = [
  {
    title: "NPR News Now",
    feedUrl: "https://feeds.npr.org/1001/rss.xml",
    category: "society",
    language: "english",
    country: "US",
    isExplicit: false,
    matureLevel: "safe",
  },
  {
    title: "BBC Global News Podcast",
    feedUrl: "https://podcasts.files.bbci.co.uk/p02nq0gn.rss",
    category: "society",
    language: "english",
    country: "UK",
    isExplicit: false,
    matureLevel: "safe",
  },
  {
    title: "TED Talks Daily",
    feedUrl: "https://feeds.feedburner.com/TEDTalks_audio",
    category: "self-growth",
    language: "english",
    country: "US",
    isExplicit: false,
    matureLevel: "safe",
  },
];

export const MUSIC_PODCAST_FEEDS: PodcastSeed[] = [
  {
    title: "Song Exploder",
    feedUrl: "https://feeds.simplecast.com/kwWc0lhf",
    category: "album-stories",
    language: "english",
    country: "US",
    isExplicit: false,
    matureLevel: "safe",
  },
  {
    title: "All Songs Considered",
    feedUrl: "https://feeds.npr.org/510019/rss.xml",
    category: "music-history",
    language: "english",
    country: "US",
    isExplicit: false,
    matureLevel: "safe",
  },
  {
    title: "Dissect",
    feedUrl: "https://feeds.megaphone.fm/dissect",
    category: "album-stories",
    language: "english",
    country: "US",
    isExplicit: false,
    matureLevel: "safe",
  },
];

export const EMOTIONAL_WORLD_PODCAST_FEEDS: PodcastSeed[] = [
  {
    title: "On Being",
    feedUrl: "https://feeds.simplecast.com/4T39YAg_",
    category: "healing-journey",
    language: "english",
    country: "US",
    isExplicit: false,
    matureLevel: "safe",
    emotionalWorld: "Healing Journey",
  },
  {
    title: "The Happiness Lab",
    feedUrl: "https://feeds.megaphone.fm/happinesslab",
    category: "focus-chamber",
    language: "english",
    country: "US",
    isExplicit: false,
    matureLevel: "safe",
    emotionalWorld: "Focus Chamber",
  },
];

export const GLOBAL_PODCAST_FEEDS: PodcastSeed[] = [
  {
    title: "Africa Daily",
    feedUrl: "https://podcasts.files.bbci.co.uk/p02pc9tn.rss",
    category: "africa",
    language: "english",
    country: "UK",
    isExplicit: false,
    matureLevel: "safe",
  },
  {
    title: "The Documentary Podcast",
    feedUrl: "https://podcasts.files.bbci.co.uk/p02nq0lx.rss",
    category: "europe",
    language: "english",
    country: "UK",
    isExplicit: false,
    matureLevel: "safe",
  },
];

export const LANGUAGE_PODCAST_FEEDS: PodcastSeed[] = [
  {
    title: "Journal en français facile",
    feedUrl: "https://rfipodcast.akamaized.net/feed/rss/fr/journal-en-francais-facile",
    category: "french",
    language: "french",
    country: "FR",
    isExplicit: false,
    matureLevel: "safe",
  },
  {
    title: "Coffee Break Spanish",
    feedUrl: "https://rss.acast.com/coffeebreakspanish",
    category: "spanish",
    language: "spanish",
    country: "UK",
    isExplicit: false,
    matureLevel: "safe",
  },
];

export const MATURE_PODCAST_FEEDS: PodcastSeed[] = [
  {
    title: "Call Her Daddy",
    feedUrl: "https://feeds.megaphone.fm/call-her-daddy",
    category: "mature-relationships",
    language: "english",
    country: "US",
    isExplicit: true,
    matureLevel: "adult",
  },
  {
    title: "Guys We F****d",
    feedUrl: "https://feeds.megaphone.fm/guyswefcked",
    category: "dating-after-dark",
    language: "english",
    country: "US",
    isExplicit: true,
    matureLevel: "adult",
  },
];

export const ALL_PODCAST_SEEDS: PodcastSeed[] = [
  ...GENERAL_PODCAST_FEEDS,
  ...MUSIC_PODCAST_FEEDS,
  ...EMOTIONAL_WORLD_PODCAST_FEEDS,
  ...GLOBAL_PODCAST_FEEDS,
  ...LANGUAGE_PODCAST_FEEDS,
  ...MATURE_PODCAST_FEEDS,
];

export function getSeedsForCategory(categoryId: string, includeMature: boolean) {
  return ALL_PODCAST_SEEDS.filter((seed) => {
    if (!includeMature && seed.matureLevel !== "safe") return false;
    return seed.category === categoryId;
  });
}

export function getSafePodcastSeeds(includeMature: boolean) {
  return ALL_PODCAST_SEEDS.filter((seed) => includeMature || seed.matureLevel === "safe");
}
