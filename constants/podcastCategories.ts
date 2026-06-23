import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { PodcastShowsQuery } from "../services/podcastCatalogApi";
import type { MoodRoomGradient } from "../utils/moodRooms";
import {
  PODCAST_EMOTIONAL_WORLDS,
  type PodcastEmotionalWorld,
} from "./podcastEmotionalWorlds";
import {
  PODCAST_MATURE_HUB_ID,
  PODCAST_MATURE_SUBCATEGORIES,
  type PodcastMatureCategory,
} from "./podcastMatureCategories";
import { PODCAST_CATALOG_TARGETS } from "./podcastFoundation";

export const HIDDEN_TUNES_PODCASTS_LABEL = "Hidden Tunes Podcasts";
export const MATURE_PODCAST_CATEGORY_ID = PODCAST_MATURE_HUB_ID;

export type PodcastCategoryTier =
  | "home-lane"
  | "emotional"
  | "browse"
  | "mature-hub"
  | "mature";

export type PodcastLaneKind = "featured" | "trending" | "popular" | "recommended";

export type PodcastCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  catalogQuery: PodcastShowsQuery;
  fallbackQuery?: PodcastShowsQuery;
  laneKind?: PodcastLaneKind;
  tier: PodcastCategoryTier;
  isMature?: boolean;
  catalogTarget?: number;
};

/** @deprecated Use PodcastCategory */
export type LaunchPodcastCategory = PodcastCategory & {
  emptyTitle: string;
  emptyMessage: string;
};

function withEmptyCopy(category: PodcastCategory): LaunchPodcastCategory {
  return {
    ...category,
    emptyTitle: `${category.title} is warming up`,
    emptyMessage: `Hidden Tunes is syncing ${category.title.toLowerCase()}. Try another room or pull to refresh.`,
  };
}

function emotionalWorldToCategory(world: PodcastEmotionalWorld): PodcastCategory {
  return {
    id: world.id,
    title: world.title,
    subtitle: world.subtitle,
    icon: world.icon,
    gradient: world.gradient,
    catalogQuery: world.catalogQuery,
    fallbackQuery: world.fallbackQuery,
    tier: "emotional",
    catalogTarget: world.catalogTarget,
  };
}

function matureSubToCategory(sub: PodcastMatureCategory): PodcastCategory {
  return {
    id: sub.id,
    title: sub.title,
    subtitle: sub.subtitle,
    icon: sub.icon,
    gradient: sub.gradient,
    catalogQuery: sub.catalogQuery,
    fallbackQuery: sub.fallbackQuery,
    tier: "mature",
    isMature: true,
  };
}

export const PODCAST_HOME_LANE_CATEGORIES: PodcastCategory[] = [
  {
    id: "featured",
    title: "Featured Podcasts",
    subtitle: "Editorial picks — active feeds, strong branding",
    icon: "star-outline",
    gradient: ["#241028", "#100810"],
    catalogQuery: { is_featured: true },
    laneKind: "featured",
    tier: "home-lane",
    catalogTarget: PODCAST_CATALOG_TARGETS.featured,
  },
  {
    id: "trending",
    title: "Trending Podcasts",
    subtitle: "Most played and opened shows right now",
    icon: "trending-up-outline",
    gradient: ["#101828", "#080C14"],
    catalogQuery: { collection: "trending" },
    fallbackQuery: { q: "trending podcasts" },
    laneKind: "trending",
    tier: "home-lane",
    catalogTarget: PODCAST_CATALOG_TARGETS.trending,
  },
  {
    id: "popular",
    title: "Most Popular",
    subtitle: "Long-term audience favorites",
    icon: "flame-outline",
    gradient: ["#2A1420", "#100810"],
    catalogQuery: { collection: "popular" },
    fallbackQuery: { q: "popular podcasts" },
    laneKind: "popular",
    tier: "home-lane",
    catalogTarget: PODCAST_CATALOG_TARGETS.popular,
  },
  {
    id: "recommended",
    title: "Recommended For You",
    subtitle: "Personal picks based on your listening",
    icon: "sparkles-outline",
    gradient: ["#102028", "#081014"],
    laneKind: "recommended",
    catalogQuery: {},
    tier: "home-lane",
  },
];

export const PODCAST_BROWSE_CATEGORIES: PodcastCategory[] = [
  {
    id: "business",
    title: "Business",
    subtitle: "Strategy, leadership, and growth",
    icon: "briefcase-outline",
    gradient: ["#141820", "#080A10"],
    catalogQuery: { category: "Business" },
    fallbackQuery: { q: "business podcast" },
    tier: "browse",
  },
  {
    id: "technology",
    title: "Technology",
    subtitle: "Innovation, tools, and future thinking",
    icon: "hardware-chip-outline",
    gradient: ["#101828", "#080C14"],
    catalogQuery: { category: "Technology" },
    fallbackQuery: { q: "technology podcast" },
    tier: "browse",
  },
  {
    id: "health",
    title: "Health",
    subtitle: "Wellness, body, and balanced living",
    icon: "heart-outline",
    gradient: ["#201828", "#0C0814"],
    catalogQuery: { category: "Health" },
    fallbackQuery: { q: "health wellness podcast" },
    tier: "browse",
  },
  {
    id: "relationships",
    title: "Relationships",
    subtitle: "Connection, love, and real talk",
    icon: "people-outline",
    gradient: ["#241028", "#100810"],
    catalogQuery: { category: "Relationships" },
    fallbackQuery: { q: "relationships podcast" },
    tier: "browse",
  },
  {
    id: "faith",
    title: "Faith",
    subtitle: "Gospel, worship, and spiritual growth",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    catalogQuery: { category: "Faith" },
    fallbackQuery: { q: "faith gospel podcast" },
    tier: "browse",
  },
  {
    id: "african-voices",
    title: "African Voices",
    subtitle: "Ghana · Nigeria · South Africa · Kenya · Uganda · Tanzania · Pan-African · Diaspora",
    icon: "earth-outline",
    gradient: ["#2A1420", "#100810"],
    catalogQuery: { category: "African Voices" },
    fallbackQuery: {
      q: "africa ghana nigeria south africa kenya uganda tanzania diaspora podcast",
    },
    tier: "browse",
    catalogTarget: PODCAST_CATALOG_TARGETS.africanVoices,
  },
  {
    id: "history",
    title: "History",
    subtitle: "Stories from the past that still matter",
    icon: "time-outline",
    gradient: ["#181818", "#0A0A0A"],
    catalogQuery: { category: "History" },
    fallbackQuery: { q: "history podcast" },
    tier: "browse",
  },
  {
    id: "science",
    title: "Science",
    subtitle: "Discovery, research, and curiosity",
    icon: "planet-outline",
    gradient: ["#102030", "#080C14"],
    catalogQuery: { category: "Science" },
    fallbackQuery: { q: "science podcast" },
    tier: "browse",
  },
  {
    id: "finance",
    title: "Finance",
    subtitle: "Money, markets, and financial freedom",
    icon: "cash-outline",
    gradient: ["#142820", "#081410"],
    catalogQuery: { category: "Finance" },
    fallbackQuery: { q: "finance money podcast" },
    tier: "browse",
  },
  {
    id: "true-crime",
    title: "True Crime",
    subtitle: "Investigations, mysteries, and justice stories",
    icon: "search-outline",
    gradient: ["#201418", "#0C0808"],
    catalogQuery: { category: "True Crime" },
    fallbackQuery: { q: "true crime podcast" },
    tier: "browse",
  },
  {
    id: "comedy",
    title: "Comedy",
    subtitle: "Smart laughs, culture, and sharp conversation",
    icon: "happy-outline",
    gradient: ["#241820", "#10080C"],
    catalogQuery: { category: "Comedy" },
    fallbackQuery: { q: "comedy podcast" },
    tier: "browse",
  },
  {
    id: "news",
    title: "News",
    subtitle: "Current events and informed daily context",
    icon: "newspaper-outline",
    gradient: ["#101828", "#080C14"],
    catalogQuery: { category: "News" },
    fallbackQuery: { q: "news podcast" },
    tier: "browse",
  },
  {
    id: "new-releases",
    title: "New Releases",
    subtitle: "Fresh shows and recently active feeds",
    icon: "sparkles-outline",
    gradient: ["#102028", "#081014"],
    catalogQuery: { collection: "new-releases" },
    fallbackQuery: { q: "new podcast episodes this week" },
    tier: "browse",
  },
  {
    id: "new-this-week",
    title: "New This Week",
    subtitle: "Shows with fresh weekly energy",
    icon: "calendar-outline",
    gradient: ["#141820", "#080A10"],
    catalogQuery: { collection: "new-this-week" },
    fallbackQuery: { q: "new this week podcast" },
    tier: "browse",
  },
  {
    id: "recently-added",
    title: "Recently Added",
    subtitle: "Newly discovered shows in Hidden Tunes",
    icon: "add-circle-outline",
    gradient: ["#181828", "#0A0A14"],
    catalogQuery: { collection: "recently-added" },
    fallbackQuery: { q: "recently added podcast" },
    tier: "browse",
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    subtitle: "Underrated shows with strong metadata",
    icon: "diamond-outline",
    gradient: ["#181828", "#0A0A14"],
    catalogQuery: { q: "hidden gem podcast" },
    fallbackQuery: { q: "indie underrated podcast" },
    tier: "browse",
  },
  {
    id: "editors-picks",
    title: "Editor's Picks",
    subtitle: "Quality-first shows worth trying next",
    icon: "star-outline",
    gradient: ["#241028", "#100810"],
    catalogQuery: { is_featured: true },
    fallbackQuery: { q: "best podcast recommendations" },
    tier: "browse",
  },
  {
    id: "most-loved",
    title: "Most Loved",
    subtitle: "Popular, consistent shows with deep catalogs",
    icon: "heart-outline",
    gradient: ["#241020", "#100810"],
    catalogQuery: { collection: "popular" },
    fallbackQuery: { q: "most popular podcast" },
    tier: "browse",
  },
  {
    id: "popular-country",
    title: "Popular In Your Country",
    subtitle: "Shows with strong local relevance",
    icon: "location-outline",
    gradient: ["#142820", "#081410"],
    catalogQuery: { q: "popular podcast in your country" },
    fallbackQuery: { q: "popular local podcast" },
    tier: "browse",
  },
  {
    id: "popular-worldwide",
    title: "Popular Worldwide",
    subtitle: "Global shows with broad momentum",
    icon: "globe-outline",
    gradient: ["#102030", "#080C14"],
    catalogQuery: { collection: "popular" },
    fallbackQuery: { q: "popular worldwide podcast" },
    tier: "browse",
  },
  {
    id: PODCAST_MATURE_HUB_ID,
    title: "Mature 18+",
    subtitle: "Adult shows — enable in Profile settings",
    icon: "eye-off-outline",
    gradient: ["#201418", "#0C0808"],
    catalogQuery: { q: "adult mature podcast" },
    tier: "mature-hub",
    isMature: true,
  },
];

export const PODCAST_CATEGORIES: PodcastCategory[] = [
  ...PODCAST_HOME_LANE_CATEGORIES,
  ...PODCAST_EMOTIONAL_WORLDS.map(emotionalWorldToCategory),
  ...PODCAST_BROWSE_CATEGORIES,
  ...PODCAST_MATURE_SUBCATEGORIES.map(matureSubToCategory),
];

export const LAUNCH_PODCAST_CATEGORIES: LaunchPodcastCategory[] =
  PODCAST_CATEGORIES.map(withEmptyCopy);

const CATEGORY_BY_ID = new Map(PODCAST_CATEGORIES.map((category) => [category.id, category]));

export function getPodcastCategory(id: string) {
  return CATEGORY_BY_ID.get(String(id || "").trim()) || null;
}

/** @deprecated Use getPodcastCategory */
export function getLaunchPodcastCategory(categoryId: string) {
  const category = getPodcastCategory(resolvePodcastCategoryId(categoryId));
  return category ? withEmptyCopy(category) : null;
}

export function getVisiblePodcastCategories(includeMature: boolean) {
  return LAUNCH_PODCAST_CATEGORIES.filter(
    (category) =>
      category.tier === "browse" || category.tier === "mature-hub"
        ? !category.isMature || includeMature
        : false
  );
}

export function getBrowsablePodcastCategories(includeMature: boolean) {
  return PODCAST_BROWSE_CATEGORIES.filter(
    (category) => !category.isMature || includeMature
  );
}

export function getEmotionalPodcastCategories(_includeMature: boolean) {
  return PODCAST_EMOTIONAL_WORLDS.map(emotionalWorldToCategory);
}

export function getHomeLanePodcastCategories() {
  return PODCAST_HOME_LANE_CATEGORIES;
}

export function getMaturePodcastSubcategories() {
  return PODCAST_MATURE_SUBCATEGORIES.map(matureSubToCategory);
}

export const PODCAST_LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  "christian-gospel": "faith",
  "adult-conversations": PODCAST_MATURE_HUB_ID,
  education: "science",
  "mature-human-behavior": "mature-human-behavior",
  "mature-adult-talk": "mature-late-night-talk",
  "mature-after-dark": "mature-after-dark-conversations",
};

export function resolvePodcastCategoryId(id: string) {
  const safe = String(id || "").trim().toLowerCase();
  return PODCAST_LEGACY_CATEGORY_ALIASES[safe] || safe;
}
