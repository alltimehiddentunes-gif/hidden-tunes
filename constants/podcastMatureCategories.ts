import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { PodcastShowsQuery } from "../services/podcastCatalogApi";
import type { MoodRoomGradient } from "../utils/moodRooms";

export type PodcastMatureCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  catalogQuery: PodcastShowsQuery;
  fallbackQuery?: PodcastShowsQuery;
};

export const PODCAST_MATURE_HUB_ID = "mature";

export const PODCAST_MATURE_SUBCATEGORIES: PodcastMatureCategory[] = [
  {
    id: "mature-dating",
    title: "Dating",
    subtitle: "Modern dating talk for adults",
    icon: "heart-outline",
    gradient: ["#241020", "#100810"],
    catalogQuery: { q: "adult dating podcast" },
    fallbackQuery: { q: "dating advice podcast mature" },
  },
  {
    id: "mature-relationships",
    title: "Relationships",
    subtitle: "Real talk about connection",
    icon: "people-outline",
    gradient: ["#201828", "#0C0814"],
    catalogQuery: { q: "adult relationships podcast" },
    fallbackQuery: { q: "relationship advice podcast 18+" },
  },
  {
    id: "mature-marriage",
    title: "Marriage",
    subtitle: "Partnership, intimacy, and commitment",
    icon: "home-outline",
    gradient: ["#1A1830", "#0A0818"],
    catalogQuery: { q: "marriage podcast adult" },
    fallbackQuery: { q: "married life podcast" },
  },
  {
    id: "mature-human-behavior",
    title: "Human Behavior",
    subtitle: "Why we do what we do",
    icon: "body-outline",
    gradient: ["#141820", "#080A10"],
    catalogQuery: { q: "human behavior psychology podcast adult" },
    fallbackQuery: { q: "behavior science podcast" },
  },
  {
    id: "mature-adult-comedy",
    title: "Adult Comedy",
    subtitle: "Unfiltered humor for grown listeners",
    icon: "happy-outline",
    gradient: ["#2A1420", "#100810"],
    catalogQuery: { q: "adult comedy podcast" },
    fallbackQuery: { q: "comedy podcast explicit" },
  },
  {
    id: "mature-after-dark",
    title: "After Dark",
    subtitle: "Late-night adult conversations",
    icon: "moon-outline",
    gradient: ["#1A1038", "#080612"],
    catalogQuery: { q: "after dark adult podcast" },
    fallbackQuery: { q: "late night adult talk podcast" },
  },
  {
    id: "mature-psychology",
    title: "Psychology",
    subtitle: "Mind, emotion, and adult insight",
    icon: "pulse-outline",
    gradient: ["#102028", "#081014"],
    catalogQuery: { q: "psychology podcast adult" },
    fallbackQuery: { q: "mental health podcast mature" },
  },
  {
    id: "mature-real-stories",
    title: "Real Stories",
    subtitle: "Unfiltered personal narratives",
    icon: "book-outline",
    gradient: ["#181818", "#0A0A0A"],
    catalogQuery: { q: "real stories podcast adult" },
    fallbackQuery: { q: "true stories podcast mature" },
  },
  {
    id: "mature-unfiltered-interviews",
    title: "Unfiltered Interviews",
    subtitle: "Raw conversations without filters",
    icon: "mic-outline",
    gradient: ["#201418", "#0C0808"],
    catalogQuery: { q: "unfiltered interview podcast adult" },
    fallbackQuery: { q: "raw interview podcast explicit" },
  },
];

const MATURE_BY_ID = new Map(PODCAST_MATURE_SUBCATEGORIES.map((cat) => [cat.id, cat]));

export function getPodcastMatureCategory(id: string) {
  return MATURE_BY_ID.get(String(id || "").trim()) || null;
}
