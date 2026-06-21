import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MoodRoomGradient } from "../utils/moodRooms";
import {
  RADIO_EMOTIONAL_WORLDS,
  type RadioEmotionalWorld,
} from "./radioEmotionalWorlds";

export type RadioCategoryTier =
  | "home-lane"
  | "emotional"
  | "browse"
  | "mature";

export type RadioLaneKind = "featured" | "trending" | "popular" | "recommended";

export type RadioCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  tag?: string;
  countryCode?: string;
  useTopVotes?: boolean;
  useTopClick?: boolean;
  laneKind?: RadioLaneKind;
  isMature?: boolean;
  tier: RadioCategoryTier;
  listeningRoomQuery: string;
};

function emotionalWorldToCategory(world: RadioEmotionalWorld): RadioCategory {
  return {
    id: world.id,
    title: world.title,
    subtitle: world.subtitle,
    icon: world.icon,
    gradient: world.gradient,
    tag: world.tag,
    tier: "emotional",
    listeningRoomQuery: world.listeningRoomQuery,
  };
}

export const RADIO_HOME_LANE_CATEGORIES: RadioCategory[] = [
  {
    id: "featured",
    title: "Featured Stations",
    subtitle: "Curated premium picks — stable streams, strong branding",
    icon: "star-outline",
    gradient: ["#241028", "#100810"],
    useTopVotes: true,
    laneKind: "featured",
    tier: "home-lane",
    listeningRoomQuery: "featured radio",
  },
  {
    id: "trending",
    title: "Trending Now",
    subtitle: "Most played and opened stations right now",
    icon: "trending-up-outline",
    gradient: ["#1A1830", "#0A0818"],
    useTopClick: true,
    laneKind: "trending",
    tier: "home-lane",
    listeningRoomQuery: "trending radio",
  },
  {
    id: "popular",
    title: "Most Popular",
    subtitle: "Long-term audience favorites",
    icon: "flame-outline",
    gradient: ["#2A1420", "#100810"],
    useTopVotes: true,
    laneKind: "popular",
    tier: "home-lane",
    listeningRoomQuery: "popular radio",
  },
  {
    id: "recommended",
    title: "Recommended For You",
    subtitle: "Personal picks based on your listening",
    icon: "sparkles-outline",
    gradient: ["#102028", "#081014"],
    laneKind: "recommended",
    tier: "home-lane",
    listeningRoomQuery: "recommended radio",
  },
];

export const RADIO_BROWSE_CATEGORIES: RadioCategory[] = [
  {
    id: "browse-country",
    title: "Countries",
    subtitle: "Browse stations by region",
    icon: "flag-outline",
    gradient: ["#102028", "#081014"],
    countryCode: "US",
    tier: "browse",
    listeningRoomQuery: "local radio",
  },
  {
    id: "browse-language",
    title: "Languages",
    subtitle: "Find stations in your language",
    icon: "chatbubble-ellipses-outline",
    gradient: ["#141820", "#080A10"],
    tag: "english",
    tier: "browse",
    listeningRoomQuery: "english radio",
  },
  {
    id: "browse-genre",
    title: "Genres",
    subtitle: "Pop, rock, jazz, and more",
    icon: "musical-notes-outline",
    gradient: ["#101828", "#080C14"],
    tag: "pop",
    tier: "browse",
    listeningRoomQuery: "genre radio",
  },
  {
    id: "talk",
    title: "Talk",
    subtitle: "News, conversation, and public voices",
    icon: "newspaper-outline",
    gradient: ["#181818", "#0A0A0A"],
    tag: "talk",
    tier: "browse",
    listeningRoomQuery: "news talk",
  },
  {
    id: "sports",
    title: "Sports",
    subtitle: "Game day energy and sports talk",
    icon: "football-outline",
    gradient: ["#142820", "#081410"],
    tag: "sports",
    tier: "browse",
    listeningRoomQuery: "sports radio",
  },
  {
    id: "faith",
    title: "Faith",
    subtitle: "Gospel, worship, and sacred calm",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    tag: "christian",
    tier: "browse",
    listeningRoomQuery: "gospel worship",
  },
  {
    id: "adult",
    title: "Adult 18+",
    subtitle: "Mature stations — enable in Profile settings",
    icon: "eye-off-outline",
    gradient: ["#201418", "#0C0808"],
    tag: "adult",
    isMature: true,
    tier: "mature",
    listeningRoomQuery: "adult talk radio",
  },
];

export const RADIO_CATEGORIES: RadioCategory[] = [
  ...RADIO_HOME_LANE_CATEGORIES,
  ...RADIO_EMOTIONAL_WORLDS.map(emotionalWorldToCategory),
  ...RADIO_BROWSE_CATEGORIES,
];

const CATEGORY_BY_ID = new Map(RADIO_CATEGORIES.map((category) => [category.id, category]));

export function getRadioCategory(id: string) {
  return CATEGORY_BY_ID.get(String(id || "").trim()) || null;
}

export function getVisibleRadioCategories(includeMature: boolean) {
  return RADIO_CATEGORIES.filter(
    (category) => !category.isMature || includeMature
  );
}

export function getBrowsableRadioCategories(includeMature: boolean) {
  return RADIO_BROWSE_CATEGORIES.filter(
    (category) => !category.isMature || includeMature
  );
}

export function getEmotionalRadioCategories(_includeMature: boolean) {
  return RADIO_EMOTIONAL_WORLDS.map(emotionalWorldToCategory);
}

export function getHomeLaneCategories() {
  return RADIO_HOME_LANE_CATEGORIES;
}

export function getProbeableRadioCategories(includeMature: boolean) {
  return [...getBrowsableRadioCategories(includeMature), ...getEmotionalRadioCategories(includeMature)];
}

/** @deprecated Legacy ids mapped for cached entries */
export const RADIO_LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  "news-talk": "talk",
  "gospel-worship": "faith",
  mature: "adult",
  "african-radio": "afro-heat",
  "world-radio": "world-mix",
};

export function resolveRadioCategoryId(id: string) {
  const safe = String(id || "").trim();
  return RADIO_LEGACY_CATEGORY_ALIASES[safe] || safe;
}
