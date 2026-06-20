import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { TvCatalogQuery } from "../services/tvCatalogApi";
import type { MoodRoomGradient } from "./moodRooms";

export const HIDDEN_TUNES_VIDEOS_LABEL = "Hidden Tunes Videos";

export type LaunchVideoCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  catalogQuery: TvCatalogQuery;
  fallbackQuery?: TvCatalogQuery;
  emptyTitle: string;
  emptyMessage: string;
};

export const LAUNCH_VIDEO_CATEGORIES: LaunchVideoCategory[] = [
  {
    id: "music-videos",
    title: "Music Videos",
    subtitle: "Official visuals and cinematic drops",
    icon: "videocam-outline",
    gradient: ["#241028", "#100810"],
    catalogQuery: { format: "Music Video" },
    fallbackQuery: { q: "music video" },
    emptyTitle: "Music Videos are warming up",
    emptyMessage:
      "Hidden Tunes is syncing music videos. Try another collection or pull to refresh.",
  },
  {
    id: "live-performances",
    title: "Live Performances",
    subtitle: "Stage energy and raw moments",
    icon: "mic-outline",
    gradient: ["#181828", "#0A0A14"],
    catalogQuery: { format: "Live Performance" },
    fallbackQuery: { q: "live performance" },
    emptyTitle: "Live Performances are warming up",
    emptyMessage:
      "Hidden Tunes is finding live sets. Browse another video room meanwhile.",
  },
  {
    id: "artist-videos",
    title: "Artist Videos",
    subtitle: "Sessions, stories, and spotlight clips",
    icon: "person-outline",
    gradient: ["#142028", "#080C12"],
    catalogQuery: { format: "Interview" },
    fallbackQuery: { q: "artist" },
    emptyTitle: "Artist Videos are warming up",
    emptyMessage:
      "Hidden Tunes is curating artist clips. Try Music Videos or Live Performances.",
  },
  {
    id: "trending-videos",
    title: "Trending Videos",
    subtitle: "Fresh picks across Hidden Tunes",
    icon: "flame-outline",
    gradient: ["#281418", "#100808"],
    catalogQuery: { page: 1 },
    emptyTitle: "Trending Videos are warming up",
    emptyMessage:
      "Hidden Tunes is refreshing trending picks. Pull down to try again.",
  },
  {
    id: "concert-videos",
    title: "Concert Videos",
    subtitle: "Full-stage and festival energy",
    icon: "musical-notes-outline",
    gradient: ["#201828", "#0C0814"],
    catalogQuery: { q: "concert" },
    fallbackQuery: { format: "Live Performance" },
    emptyTitle: "Concert Videos are warming up",
    emptyMessage:
      "Hidden Tunes is syncing concert footage. Try Live Performances meanwhile.",
  },
  {
    id: "worship-videos",
    title: "Worship Videos",
    subtitle: "Praise, faith, and sacred calm",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    catalogQuery: { mood: "Worship" },
    fallbackQuery: { genre: "Gospel" },
    emptyTitle: "Worship Videos are warming up",
    emptyMessage:
      "Hidden Tunes is finding worship visuals. Try Gospel genre collections.",
  },
  {
    id: "afrobeats-videos",
    title: "Afrobeats Videos",
    subtitle: "Afro heat, rhythm, and fusion fire",
    icon: "planet-outline",
    gradient: ["#2A1420", "#100810"],
    catalogQuery: { genre: "Afrobeats" },
    fallbackQuery: { q: "afrobeats" },
    emptyTitle: "Afrobeats Videos are warming up",
    emptyMessage:
      "Hidden Tunes is syncing Afrobeats visuals. Try another genre room.",
  },
  {
    id: "country-sessions",
    title: "Country Sessions",
    subtitle: "Twang, stories, and acoustic rooms",
    icon: "navigate-outline",
    gradient: ["#241810", "#100C08"],
    catalogQuery: { genre: "Country" },
    fallbackQuery: { q: "country session" },
    emptyTitle: "Country Sessions are warming up",
    emptyMessage:
      "Hidden Tunes is finding country sessions. Try Country genre hubs or pull to refresh.",
  },
];

export function getLaunchVideoCategory(categoryId: string) {
  const safeId = String(categoryId || "").trim().toLowerCase();
  return LAUNCH_VIDEO_CATEGORIES.find((category) => category.id === safeId) || null;
}
