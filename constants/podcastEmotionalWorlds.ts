import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { PodcastShowsQuery } from "../services/podcastCatalogApi";
import type { MoodRoomGradient } from "../utils/moodRooms";
import { PODCAST_CATALOG_TARGETS } from "./podcastFoundation";

export type PodcastEmotionalWorld = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  catalogQuery: PodcastShowsQuery;
  fallbackQuery?: PodcastShowsQuery;
  matchTags: string[];
  matchCategories: string[];
  catalogTarget: number;
};

export const PODCAST_EMOTIONAL_WORLDS: PodcastEmotionalWorld[] = [
  {
    id: "heartbreak-recovery",
    title: "Heartbreak Recovery",
    subtitle: "Acoustic · Soft Pop · Soul · Healing · Reflection",
    icon: "heart-dislike-outline",
    gradient: ["#241020", "#100810"],
    catalogQuery: { q: "heartbreak healing acoustic podcast" },
    fallbackQuery: { category: "Relationships" },
    matchTags: ["heartbreak", "healing", "acoustic", "love", "breakup", "soul"],
    matchCategories: ["Relationships", "Health"],
    catalogTarget: PODCAST_CATALOG_TARGETS.heartbreakRecovery,
  },
  {
    id: "night-drive",
    title: "Night Drive",
    subtitle: "Late night · Chill · Jazz · R&B · Ambient stories",
    icon: "moon-outline",
    gradient: ["#1A1038", "#080612"],
    catalogQuery: { q: "late night chill podcast" },
    fallbackQuery: { q: "night drive stories podcast" },
    matchTags: ["night", "chill", "late", "drive", "ambient", "jazz"],
    matchCategories: ["Society", "Arts"],
    catalogTarget: PODCAST_CATALOG_TARGETS.nightDrive,
  },
  {
    id: "sunday-worship",
    title: "Sunday Worship",
    subtitle: "Gospel · Christian · Worship · Praise · Sermons",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    catalogQuery: { category: "Faith" },
    fallbackQuery: { q: "gospel worship podcast" },
    matchTags: ["gospel", "christian", "worship", "praise", "sermon", "faith"],
    matchCategories: ["Faith"],
    catalogTarget: PODCAST_CATALOG_TARGETS.sundayWorship,
  },
  {
    id: "deep-focus",
    title: "Deep Focus",
    subtitle: "LoFi · Ambient · Classical · Study · Instrumental",
    icon: "pulse-outline",
    gradient: ["#102028", "#081014"],
    catalogQuery: { q: "focus study productivity podcast" },
    fallbackQuery: { category: "Education" },
    matchTags: ["focus", "study", "productivity", "learning", "mindfulness"],
    matchCategories: ["Education", "Science"],
    catalogTarget: PODCAST_CATALOG_TARGETS.deepFocus,
  },
  {
    id: "afro-heat",
    title: "Afro Heat",
    subtitle: "Afrobeats · Amapiano · Highlife · Afro House · Urban",
    icon: "flame-outline",
    gradient: ["#2A1420", "#100810"],
    catalogQuery: { category: "African Voices" },
    fallbackQuery: { q: "afrobeat amapiano african podcast" },
    matchTags: ["afro", "afrobeat", "amapiano", "african", "highlife"],
    matchCategories: ["African Voices"],
    catalogTarget: PODCAST_CATALOG_TARGETS.afroHeat,
  },
  {
    id: "hidden-treasures",
    title: "Hidden Treasures",
    subtitle: "Undiscovered shows · Small creators · Regional gems",
    icon: "diamond-outline",
    gradient: ["#181828", "#0A0A14"],
    catalogQuery: { q: "indie underground podcast" },
    fallbackQuery: { q: "hidden gem podcast discovery" },
    matchTags: ["indie", "underground", "discovery", "local", "community"],
    matchCategories: ["Society", "Arts"],
    catalogTarget: PODCAST_CATALOG_TARGETS.hiddenTreasures,
  },
];

const WORLD_BY_ID = new Map(PODCAST_EMOTIONAL_WORLDS.map((world) => [world.id, world]));

export function getPodcastEmotionalWorld(id: string) {
  return WORLD_BY_ID.get(String(id || "").trim()) || null;
}

export function showMatchesEmotionalWorld(
  show: { categories?: string[]; primary_category?: string; title?: string },
  world: PodcastEmotionalWorld
) {
  const haystack = [
    ...(show.categories || []),
    show.primary_category || "",
    show.title || "",
  ]
    .join(" ")
    .toLowerCase();

  if (world.matchCategories.some((cat) => haystack.includes(cat.toLowerCase()))) {
    return true;
  }

  return world.matchTags.some((tag) => haystack.includes(tag.toLowerCase()));
}
