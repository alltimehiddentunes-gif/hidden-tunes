import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MoodRoomGradient } from "./moodRooms";

export type MaturePodcastCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
};

export const MATURE_PODCAST_CATEGORY_DEFINITIONS: MaturePodcastCategory[] = [
  {
    id: "all-mature",
    title: "All Mature Podcasts",
    subtitle: "Every 18+ Hidden Tunes show in one place",
    icon: "albums-outline",
    gradient: ["#281418", "#100808"],
  },
  {
    id: "mature-relationships",
    title: "Mature Relationships",
    subtitle: "Love, dating, and adult relationship talk",
    icon: "heart-outline",
    gradient: ["#2A1420", "#100810"],
  },
  {
    id: "adult-comedy",
    title: "Adult Comedy",
    subtitle: "Explicit humor and uncensored laughs",
    icon: "happy-outline",
    gradient: ["#241028", "#100810"],
  },
  {
    id: "sex-education",
    title: "Sex Education",
    subtitle: "Adult health, intimacy, and education",
    icon: "school-outline",
    gradient: ["#201828", "#0C0814"],
  },
  {
    id: "explicit-interviews",
    title: "Explicit Interviews",
    subtitle: "Raw conversations without the filter",
    icon: "mic-outline",
    gradient: ["#201418", "#0C0808"],
  },
];

export function getMaturePodcastCategory(categoryId: string) {
  const safeId = String(categoryId || "").trim().toLowerCase();
  return (
    MATURE_PODCAST_CATEGORY_DEFINITIONS.find((category) => category.id === safeId) ||
    null
  );
}

export function isMaturePodcastCategoryId(categoryId: string) {
  return Boolean(getMaturePodcastCategory(categoryId));
}
