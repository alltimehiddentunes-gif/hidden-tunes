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
    id: "country",
    title: "Country Radio",
    subtitle: "Stories, twang, and wide-open roads",
    icon: "navigate-outline",
    gradient: ["#241810", "#100C08"],
    tag: "country",
    listeningRoomQuery: "country music",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "gospel",
    title: "Gospel Radio",
    subtitle: "Praise, worship, and sacred calm",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    tag: "gospel",
    listeningRoomQuery: "gospel worship",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "afrobeats",
    title: "Afrobeats Radio",
    subtitle: "Afro energy and fusion fire",
    icon: "flame-outline",
    gradient: ["#2A1420", "#100810"],
    tag: "afrobeat",
    listeningRoomQuery: "afrobeats",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "jazz",
    title: "Jazz Radio",
    subtitle: "Smooth, late-hour listening",
    icon: "musical-notes-outline",
    gradient: ["#101828", "#080C14"],
    tag: "jazz",
    listeningRoomQuery: "jazz",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "classical",
    title: "Classical Radio",
    subtitle: "Orchestral focus and calm",
    icon: "library-outline",
    gradient: ["#141820", "#080A10"],
    tag: "classical",
    listeningRoomQuery: "classical",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "news",
    title: "News Radio",
    subtitle: "Talk, headlines, and public voices",
    icon: "newspaper-outline",
    gradient: ["#181818", "#0A0A0A"],
    tag: "news",
    listeningRoomQuery: "news talk",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "global",
    title: "Global Radio",
    subtitle: "Popular stations across the world",
    icon: "globe-outline",
    gradient: ["#102030", "#080C14"],
    useTopVotes: true,
    listeningRoomQuery: "world music",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "mood",
    title: "Mood Radio",
    subtitle: "Rooms shaped by feeling",
    icon: "moon-outline",
    gradient: ["#1A1038", "#080612"],
    tag: "chill",
    listeningRoomQuery: "chill mood music",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "location",
    title: "Location Radio",
    subtitle: "Stations by region",
    icon: "location-outline",
    gradient: ["#102028", "#081014"],
    countryCode: "US",
    listeningRoomQuery: "local radio",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "relationship",
    title: "Relationship Radio",
    subtitle: "Love songs and emotional connection",
    icon: "heart-outline",
    gradient: ["#2A1420", "#100810"],
    tag: "love",
    listeningRoomQuery: "love songs romantic",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "faith",
    title: "Faith Radio",
    subtitle: "Spiritual calm and inspiration",
    icon: "sunny-outline",
    gradient: ["#1A2030", "#0A1018"],
    tag: "christian",
    listeningRoomQuery: "faith worship spiritual",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "focus",
    title: "Focus Radio",
    subtitle: "Ambient rooms for concentration",
    icon: "pulse-outline",
    gradient: ["#101C2E", "#080C14"],
    tag: "ambient",
    listeningRoomQuery: "focus ambient study",
    emptyTitle: "Nothing here yet.",
    emptyMessage: "Try another category or open a listening room.",
  },
  {
    id: "mature",
    title: "Mature Radio",
    subtitle: "18+ stations — enable in Profile settings",
    icon: "eye-off-outline",
    gradient: ["#201418", "#0C0808"],
    tag: "adult",
    isMature: true,
    listeningRoomQuery: "adult talk radio",
    emptyTitle: "No mature stations right now",
    emptyMessage: "Turn on Show 18+ Content in Profile to browse this room.",
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
