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
    subtitle: "Every 18+ show in one place",
    icon: "albums-outline",
    gradient: ["#281418", "#100808"],
  },
  {
    id: "relationships-dating",
    title: "Relationships & Dating",
    subtitle: "Love, dating, and intimacy conversations",
    icon: "heart-outline",
    gradient: ["#2A1420", "#100810"],
  },
  {
    id: "sex-education",
    title: "Sex Education",
    subtitle: "Sexual health and intimacy education",
    icon: "school-outline",
    gradient: ["#201828", "#0C0814"],
  },
  {
    id: "adult-comedy",
    title: "Adult Comedy",
    subtitle: "Explicit humor and uncensored laughs",
    icon: "happy-outline",
    gradient: ["#241028", "#100810"],
  },
  {
    id: "confessions-storytelling",
    title: "Confessions & Storytelling",
    subtitle: "Raw stories told without filters",
    icon: "book-outline",
    gradient: ["#201418", "#0C0808"],
  },
  {
    id: "psychology-intimacy",
    title: "Psychology & Intimacy",
    subtitle: "Therapy-informed adult conversations",
    icon: "pulse-outline",
    gradient: ["#1C1828", "#0C0814"],
  },
  {
    id: "marriage-couples",
    title: "Marriage & Couples",
    subtitle: "Partnership, marriage, and connection",
    icon: "people-outline",
    gradient: ["#241820", "#100810"],
  },
  {
    id: "womens-health",
    title: "Women's Health",
    subtitle: "Body, wellness, and sexual health",
    icon: "rose-outline",
    gradient: ["#281420", "#100810"],
  },
  {
    id: "mens-health",
    title: "Men's Health",
    subtitle: "Health, growth, and modern manhood",
    icon: "barbell-outline",
    gradient: ["#182028", "#080C10"],
  },
  {
    id: "lgbtq-conversations",
    title: "LGBTQ+ Conversations",
    subtitle: "Queer stories, dating, and culture",
    icon: "people-circle-outline",
    gradient: ["#201828", "#0C0814"],
  },
  {
    id: "explicit-interviews",
    title: "Explicit Interviews",
    subtitle: "Long-form conversations without filters",
    icon: "mic-outline",
    gradient: ["#201418", "#0C0808"],
  },
  {
    id: "after-dark-talk",
    title: "After Dark Talk",
    subtitle: "Late-night adult culture and banter",
    icon: "moon-outline",
    gradient: ["#181420", "#080810"],
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
