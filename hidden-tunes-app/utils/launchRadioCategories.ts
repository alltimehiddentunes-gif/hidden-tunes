import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MoodRoomGradient } from "./moodRooms";

export type LaunchRadioCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  /** Radio Browser search tag */
  tag?: string;
  /** ISO country code for location-style categories */
  countryCode?: string;
  /** Use top-voted stations instead of tag search */
  useTopVotes?: boolean;
  /** Extra search terms for song listening room fallback */
  listeningRoomQuery: string;
  emptyTitle: string;
  emptyMessage: string;
};

export const LAUNCH_RADIO_CATEGORIES: LaunchRadioCategory[] = [
  {
    id: "country",
    title: "Country Radio",
    subtitle: "Stories, twang, and wide-open roads",
    icon: "navigate-outline",
    gradient: ["#241810", "#100C08"],
    tag: "country",
    listeningRoomQuery: "country music",
    emptyTitle: "Country Radio is warming up",
    emptyMessage:
      "Try the Country genre hub or Hidden Tunes song listening rooms while stations load.",
  },
  {
    id: "gospel",
    title: "Gospel Radio",
    subtitle: "Praise, worship, and sacred calm",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    tag: "gospel",
    listeningRoomQuery: "gospel worship",
    emptyTitle: "Gospel Radio is warming up",
    emptyMessage:
      "Browse Gospel genres or faith listening rooms in Hidden Tunes while stations arrive.",
  },
  {
    id: "afrobeats",
    title: "Afrobeats Radio",
    subtitle: "Afro energy and fusion fire",
    icon: "flame-outline",
    gradient: ["#2A1420", "#100810"],
    tag: "afrobeat",
    listeningRoomQuery: "afrobeats",
    emptyTitle: "Afrobeats Radio is warming up",
    emptyMessage:
      "Explore Afrobeats in Hidden Tunes while live stations sync to this room.",
  },
  {
    id: "jazz",
    title: "Jazz Radio",
    subtitle: "Smooth, late-hour listening",
    icon: "musical-notes-outline",
    gradient: ["#101828", "#080C14"],
    tag: "jazz",
    listeningRoomQuery: "jazz",
    emptyTitle: "Jazz Radio is warming up",
    emptyMessage:
      "Try Jazz genre hubs or Hidden Tunes mood rooms while stations load.",
  },
  {
    id: "classical",
    title: "Classical Radio",
    subtitle: "Orchestral focus and calm",
    icon: "library-outline",
    gradient: ["#141820", "#080A10"],
    tag: "classical",
    listeningRoomQuery: "classical",
    emptyTitle: "Classical Radio is warming up",
    emptyMessage:
      "Browse classical and instrumental Hidden Tunes while stations warm up.",
  },
  {
    id: "news",
    title: "News Radio",
    subtitle: "Talk, headlines, and public voices",
    icon: "newspaper-outline",
    gradient: ["#181818", "#0A0A0A"],
    tag: "news",
    listeningRoomQuery: "news talk",
    emptyTitle: "News Radio is warming up",
    emptyMessage:
      "Check back soon or browse other Hidden Tunes Radio categories.",
  },
  {
    id: "global",
    title: "Global Radio",
    subtitle: "Popular stations across the world",
    icon: "globe-outline",
    gradient: ["#102030", "#080C14"],
    useTopVotes: true,
    listeningRoomQuery: "world music",
    emptyTitle: "Global Radio is warming up",
    emptyMessage:
      "Hidden Tunes is finding global stations. Try another category meanwhile.",
  },
  {
    id: "mood",
    title: "Mood Radio",
    subtitle: "Rooms shaped by feeling",
    icon: "moon-outline",
    gradient: ["#1A1038", "#080612"],
    tag: "chill",
    listeningRoomQuery: "chill mood music",
    emptyTitle: "Mood Radio is warming up",
    emptyMessage:
      "Open Emotional Worlds or mood collections while Hidden Tunes stations load.",
  },
  {
    id: "location",
    title: "Location Radio",
    subtitle: "Stations by region",
    icon: "location-outline",
    gradient: ["#102028", "#081014"],
    countryCode: "US",
    listeningRoomQuery: "local radio",
    emptyTitle: "Location Radio is warming up",
    emptyMessage:
      "Regional stations are syncing. Browse Global Radio or song listening rooms.",
  },
  {
    id: "relationship",
    title: "Relationship Radio",
    subtitle: "Love songs and emotional connection",
    icon: "heart-outline",
    gradient: ["#2A1420", "#100810"],
    tag: "love",
    listeningRoomQuery: "love songs romantic",
    emptyTitle: "Relationship Radio is warming up",
    emptyMessage:
      "Try Soul or Pop listening rooms in Hidden Tunes while stations load.",
  },
  {
    id: "faith",
    title: "Faith Radio",
    subtitle: "Spiritual calm and inspiration",
    icon: "sunny-outline",
    gradient: ["#1A2030", "#0A1018"],
    tag: "christian",
    listeningRoomQuery: "faith worship spiritual",
    emptyTitle: "Faith Radio is warming up",
    emptyMessage:
      "Browse Worship Sanctuary or Gospel hubs while faith stations load.",
  },
  {
    id: "focus",
    title: "Focus Radio",
    subtitle: "Ambient rooms for concentration",
    icon: "pulse-outline",
    gradient: ["#101C2E", "#080C14"],
    tag: "ambient",
    listeningRoomQuery: "focus ambient study",
    emptyTitle: "Focus Radio is warming up",
    emptyMessage:
      "Try Deep Focus emotional worlds or Lo-Fi listening rooms meanwhile.",
  },
];

const CATEGORY_BY_ID = new Map(
  LAUNCH_RADIO_CATEGORIES.map((category) => [category.id, category])
);

export function getLaunchRadioCategory(id: string) {
  return CATEGORY_BY_ID.get(String(id || "").trim()) || null;
}
