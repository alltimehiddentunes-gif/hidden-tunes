import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MoodRoomGradient } from "../utils/moodRooms";
import {
  RADIO_EMOTIONAL_WORLDS,
  type RadioEmotionalWorld,
} from "./radioEmotionalWorlds";

export type RadioCategoryTier = "internal" | "emotional" | "browse" | "mature";

export type RadioCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  tag?: string;
  countryCode?: string;
  useTopVotes?: boolean;
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

export const RADIO_CATEGORIES: RadioCategory[] = [
  {
    id: "featured",
    title: "Featured Stations",
    subtitle: "Editorial picks across Hidden Tunes Radio",
    icon: "star-outline",
    gradient: ["#241028", "#100810"],
    useTopVotes: true,
    tier: "internal",
    listeningRoomQuery: "featured radio",
  },
  ...RADIO_EMOTIONAL_WORLDS.map(emotionalWorldToCategory),
  {
    id: "browse-country",
    title: "Browse by Country",
    subtitle: "United States stations to start",
    icon: "flag-outline",
    gradient: ["#102028", "#081014"],
    countryCode: "US",
    tier: "browse",
    listeningRoomQuery: "local radio",
  },
  {
    id: "browse-language",
    title: "Browse by Language",
    subtitle: "English-language stations",
    icon: "chatbubble-ellipses-outline",
    gradient: ["#141820", "#080A10"],
    tag: "english",
    tier: "browse",
    listeningRoomQuery: "english radio",
  },
  {
    id: "browse-genre",
    title: "Browse by Genre",
    subtitle: "Pop, rock, jazz, and more",
    icon: "musical-notes-outline",
    gradient: ["#101828", "#080C14"],
    tag: "pop",
    tier: "browse",
    listeningRoomQuery: "genre radio",
  },
  {
    id: "news-talk",
    title: "News & Talk",
    subtitle: "Headlines, talk, and public voices",
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
    id: "gospel-worship",
    title: "Gospel & Worship",
    subtitle: "Praise, worship, and sacred calm",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    tag: "christian",
    tier: "browse",
    listeningRoomQuery: "gospel worship",
  },
  {
    id: "african-radio",
    title: "African Radio",
    subtitle: "Afro sounds and continental voices",
    icon: "earth-outline",
    gradient: ["#2A1420", "#100810"],
    tag: "afrobeat",
    tier: "browse",
    listeningRoomQuery: "afrobeat radio",
  },
  {
    id: "world-radio",
    title: "World Radio",
    subtitle: "Global stations from every corner",
    icon: "globe-outline",
    gradient: ["#102030", "#080C14"],
    tag: "world",
    tier: "browse",
    listeningRoomQuery: "world music radio",
  },
  {
    id: "mature",
    title: "Mature / 18+",
    subtitle: "Adult stations — enable in Profile settings",
    icon: "eye-off-outline",
    gradient: ["#201418", "#0C0808"],
    tag: "adult",
    isMature: true,
    tier: "mature",
    listeningRoomQuery: "adult talk radio",
  },
];

const CATEGORY_BY_ID = new Map(RADIO_CATEGORIES.map((category) => [category.id, category]));

export function getRadioCategory(id: string) {
  return CATEGORY_BY_ID.get(String(id || "").trim()) || null;
}

export function getVisibleRadioCategories(includeMature: boolean) {
  return RADIO_CATEGORIES.filter(
    (category) =>
      category.tier !== "internal" &&
      (!category.isMature || includeMature)
  );
}

export function getBrowsableRadioCategories(includeMature: boolean) {
  return getVisibleRadioCategories(includeMature).filter(
    (category) => category.tier === "browse" || category.tier === "mature"
  );
}

export function getEmotionalRadioCategories(includeMature: boolean) {
  return getVisibleRadioCategories(includeMature).filter(
    (category) => category.tier === "emotional"
  );
}

export function getProbeableRadioCategories(includeMature: boolean) {
  return getVisibleRadioCategories(includeMature);
}
