import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { PodcastShowsQuery } from "../services/podcastCatalogApi";
import type { MoodRoomGradient } from "./moodRooms";

export const HIDDEN_TUNES_PODCASTS_LABEL = "Hidden Tunes Podcasts";
export const MATURE_PODCAST_CATEGORY_ID = "adult-conversations";

export type LaunchPodcastCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  catalogQuery: PodcastShowsQuery;
  fallbackQuery?: PodcastShowsQuery;
  emptyTitle: string;
  emptyMessage: string;
  isMature?: boolean;
};

function categoryConfig(
  id: string,
  title: string,
  subtitle: string,
  icon: ComponentProps<typeof Ionicons>["name"],
  gradient: MoodRoomGradient,
  emptyHint: string,
  options?: {
    isMature?: boolean;
    catalogQuery?: PodcastShowsQuery;
    fallbackQuery?: PodcastShowsQuery;
  }
): LaunchPodcastCategory {
  return {
    id,
    title,
    subtitle,
    icon,
    gradient,
    catalogQuery: options?.catalogQuery || { category: title },
    fallbackQuery: options?.fallbackQuery || { q: title },
    emptyTitle: `${title} is warming up`,
    emptyMessage: `Hidden Tunes is syncing ${emptyHint}. Try another room or pull to refresh.`,
    isMature: options?.isMature,
  };
}

export const LAUNCH_PODCAST_CATEGORIES: LaunchPodcastCategory[] = [
  categoryConfig(
    "featured",
    "Featured Podcasts",
    "Editorial picks from Hidden Tunes",
    "star-outline",
    ["#241028", "#100810"],
    "featured shows",
    { catalogQuery: { is_featured: true } }
  ),
  categoryConfig(
    "trending",
    "Trending Podcasts",
    "What listeners are talking about",
    "trending-up-outline",
    ["#101828", "#080C14"],
    "trending shows",
    { catalogQuery: { collection: "trending" }, fallbackQuery: { q: "trending podcasts" } }
  ),
  categoryConfig(
    "new-releases",
    "New Releases",
    "Fresh episodes and new shows",
    "sparkles-outline",
    ["#181828", "#0A0A14"],
    "new release shows",
    { catalogQuery: { collection: "new" }, fallbackQuery: { q: "new podcast releases" } }
  ),
  categoryConfig(
    "business",
    "Business",
    "Strategy, leadership, and growth rooms",
    "briefcase-outline",
    ["#141820", "#080A10"],
    "business shows"
  ),
  categoryConfig(
    "technology",
    "Technology",
    "Innovation, tools, and future thinking",
    "hardware-chip-outline",
    ["#101828", "#080C14"],
    "technology shows"
  ),
  categoryConfig(
    "education",
    "Education",
    "Learning, skills, and knowledge rooms",
    "school-outline",
    ["#181828", "#0A0A14"],
    "education shows"
  ),
  categoryConfig(
    "christian-gospel",
    "Christian / Gospel",
    "Faith, worship, and spiritual growth",
    "sparkles-outline",
    ["#1A1830", "#0A0818"],
    "Christian and gospel shows",
    { catalogQuery: { category: "Faith" }, fallbackQuery: { q: "gospel podcast" } }
  ),
  categoryConfig(
    "african-voices",
    "African Voices",
    "Stories and perspectives from the continent",
    "earth-outline",
    ["#2A1420", "#100810"],
    "African voice shows"
  ),
  categoryConfig(
    "true-crime",
    "True Crime",
    "Mystery, cases, and investigative stories",
    "search-outline",
    ["#201418", "#0C0808"],
    "true crime shows",
    { fallbackQuery: { q: "true crime podcast" } }
  ),
  categoryConfig(
    "health",
    "Health",
    "Wellness, body, and balanced living",
    "heart-outline",
    ["#201828", "#0C0814"],
    "health shows"
  ),
  categoryConfig(
    "relationships",
    "Relationships",
    "Connection, love, and real talk",
    "people-outline",
    ["#241028", "#100810"],
    "relationship shows"
  ),
  categoryConfig(
    "adult-conversations",
    "Mature / 18+",
    "Adult talk curated for Hidden Tunes",
    "eye-outline",
    ["#201418", "#0C0808"],
    "adult conversation shows",
    { isMature: true }
  ),
];

export function getLaunchPodcastCategory(categoryId: string) {
  const safeId = String(categoryId || "").trim().toLowerCase();
  return LAUNCH_PODCAST_CATEGORIES.find((category) => category.id === safeId) || null;
}

export function getVisiblePodcastCategories(includeMature: boolean) {
  return LAUNCH_PODCAST_CATEGORIES.filter(
    (category) => !category.isMature || includeMature
  );
}
