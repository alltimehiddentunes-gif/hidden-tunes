import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { PodcastShowsQuery } from "../services/podcastCatalogApi";
import type { MoodRoomGradient } from "../utils/moodRooms";
import {
  getMaturePodcastQueryGroup,
  resolveMaturePodcastQueryGroupId,
} from "./maturePodcastQueryGroups";

export type PodcastMatureCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  queryGroupId: string;
  catalogQuery: PodcastShowsQuery;
  fallbackQuery?: PodcastShowsQuery;
};

export const PODCAST_MATURE_HUB_ID = "mature";

function matureCategory(
  id: string,
  title: string,
  subtitle: string,
  icon: ComponentProps<typeof Ionicons>["name"],
  gradient: MoodRoomGradient,
  queryGroupId: string
): PodcastMatureCategory {
  const group = getMaturePodcastQueryGroup(queryGroupId);
  const primaryQuery = group?.primaryQuery || `${queryGroupId} podcast`;

  return {
    id,
    title,
    subtitle,
    icon,
    gradient,
    queryGroupId,
    catalogQuery: { q: primaryQuery, includeMature: true },
    fallbackQuery: group?.keywords[1]
      ? { q: `${group.keywords[1]} podcast`, includeMature: true }
      : undefined,
  };
}

export const PODCAST_MATURE_SUBCATEGORIES: PodcastMatureCategory[] = [
  matureCategory(
    "mature-adult-talk",
    "Adult Talk",
    "Grown conversations with consent-first access",
    "chatbubbles-outline",
    ["#201418", "#0C0808"],
    "adult-talk"
  ),
  matureCategory(
    "mature-dating",
    "Dating",
    "Modern dating talk for adults",
    "heart-outline",
    ["#241020", "#100810"],
    "dating"
  ),
  matureCategory(
    "mature-relationships",
    "Relationships",
    "Real talk about connection",
    "people-outline",
    ["#201828", "#0C0814"],
    "relationships"
  ),
  matureCategory(
    "mature-marriage",
    "Marriage",
    "Partnership, intimacy, and commitment",
    "home-outline",
    ["#1A1830", "#0A0818"],
    "marriage"
  ),
  matureCategory(
    "mature-sexual-health",
    "Sexual Health",
    "Education, intimacy, and wellbeing",
    "fitness-outline",
    ["#201020", "#0C0810"],
    "sexual-health"
  ),
  matureCategory(
    "mature-adult-psychology",
    "Adult Psychology",
    "Mind, behavior, and adult insight",
    "pulse-outline",
    ["#102028", "#081014"],
    "adult-psychology"
  ),
  matureCategory(
    "mature-adult-comedy",
    "Adult Comedy",
    "Unfiltered humor for grown listeners",
    "happy-outline",
    ["#2A1420", "#100810"],
    "adult-comedy"
  ),
  matureCategory(
    "mature-after-dark",
    "After Dark",
    "Late-night adult conversations",
    "moon-outline",
    ["#1A1038", "#080612"],
    "after-dark"
  ),
  matureCategory(
    "mature-real-stories",
    "Real Stories",
    "Unfiltered personal narratives",
    "book-outline",
    ["#181818", "#0A0A0A"],
    "real-stories"
  ),
  matureCategory(
    "mature-unfiltered-interviews",
    "Unfiltered Interviews",
    "Raw conversations without filters",
    "mic-outline",
    ["#201418", "#0C0808"],
    "unfiltered-interviews"
  ),
  matureCategory(
    "mature-lifestyle-18",
    "Lifestyle 18+",
    "Adult lifestyle, nightlife, and culture",
    "wine-outline",
    ["#241820", "#100C10"],
    "lifestyle-18"
  ),
];

const MATURE_BY_ID = new Map(PODCAST_MATURE_SUBCATEGORIES.map((cat) => [cat.id, cat]));

export function getPodcastMatureCategory(id: string) {
  return MATURE_BY_ID.get(String(id || "").trim()) || null;
}

export function getPodcastMatureQueryGroupForCategory(categoryId: string) {
  const category = getPodcastMatureCategory(categoryId);
  const groupId = category?.queryGroupId || resolveMaturePodcastQueryGroupId(categoryId);
  return getMaturePodcastQueryGroup(groupId);
}
