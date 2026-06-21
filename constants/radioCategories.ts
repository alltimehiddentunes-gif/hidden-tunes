import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MoodRoomGradient } from "../utils/moodRooms";

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
  listeningRoomQuery: string;
  emptyTitle: string;
  emptyMessage: string;
};

export const RADIO_CATEGORIES: RadioCategory[] = [
  {
    id: "featured",
    title: "Featured Stations",
    subtitle: "Popular picks across Hidden Tunes Radio",
    icon: "star-outline",
    gradient: ["#241028", "#100810"],
    useTopVotes: true,
    listeningRoomQuery: "featured radio",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "browse-country",
    title: "Browse by Country",
    subtitle: "Stations grouped by region",
    icon: "flag-outline",
    gradient: ["#102028", "#081014"],
    countryCode: "US",
    listeningRoomQuery: "local radio",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "browse-language",
    title: "Browse by Language",
    subtitle: "Find stations in your language",
    icon: "chatbubble-ellipses-outline",
    gradient: ["#141820", "#080A10"],
    tag: "english",
    listeningRoomQuery: "english radio",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "browse-genre",
    title: "Browse by Genre",
    subtitle: "Pop, jazz, classical, and more",
    icon: "musical-notes-outline",
    gradient: ["#101828", "#080C14"],
    tag: "pop",
    listeningRoomQuery: "genre radio",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "news-talk",
    title: "News & Talk",
    subtitle: "Headlines, talk, and public voices",
    icon: "newspaper-outline",
    gradient: ["#181818", "#0A0A0A"],
    tag: "news",
    listeningRoomQuery: "news talk",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "sports",
    title: "Sports",
    subtitle: "Game day energy and sports talk",
    icon: "football-outline",
    gradient: ["#142820", "#081410"],
    tag: "sports",
    listeningRoomQuery: "sports radio",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "gospel-worship",
    title: "Gospel & Worship",
    subtitle: "Praise, worship, and sacred calm",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    tag: "gospel",
    listeningRoomQuery: "gospel worship",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "african-radio",
    title: "African Radio",
    subtitle: "Afro sounds and continental voices",
    icon: "earth-outline",
    gradient: ["#2A1420", "#100810"],
    tag: "africa",
    listeningRoomQuery: "african radio",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "world-radio",
    title: "World Radio",
    subtitle: "Global stations from every corner",
    icon: "globe-outline",
    gradient: ["#102030", "#080C14"],
    useTopVotes: true,
    listeningRoomQuery: "world music",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "mature",
    title: "Mature / 18+",
    subtitle: "Adult stations — enable in Profile settings",
    icon: "eye-off-outline",
    gradient: ["#201418", "#0C0808"],
    tag: "adult",
    isMature: true,
    listeningRoomQuery: "adult talk radio",
    emptyTitle: "No mature stations right now",
    emptyMessage: "Turn on Show Mature Content in Profile to browse this room.",
  },
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
