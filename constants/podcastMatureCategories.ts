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
  /** When false, category is merged into hub rails instead of standalone browse tile. */
  hubStandalone?: boolean;
};

export const PODCAST_MATURE_HUB_ID = "mature";

function matureCategory(
  id: string,
  title: string,
  subtitle: string,
  icon: ComponentProps<typeof Ionicons>["name"],
  gradient: MoodRoomGradient,
  queryGroupId: string,
  hubStandalone = true
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
      ? {
          q: group.keywords[1].includes("podcast")
            ? group.keywords[1]
            : `${group.keywords[1]} podcast`,
          includeMature: true,
        }
      : undefined,
    hubStandalone,
  };
}

export const PODCAST_MATURE_SUBCATEGORIES: PodcastMatureCategory[] = [
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
    "marriage",
    false
  ),
  matureCategory(
    "mature-breakups-divorce",
    "Breakups & Divorce",
    "Healing, separation, and moving forward",
    "heart-dislike-outline",
    ["#281018", "#100810"],
    "breakups-divorce",
    false
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
    "mature-intimacy-communication",
    "Intimacy & Communication",
    "Connection, trust, and honest talk",
    "chatbubble-ellipses-outline",
    ["#1A2030", "#0A0C14"],
    "intimacy-communication",
    false
  ),
  matureCategory(
    "mature-adult-psychology",
    "Adult Psychology",
    "Mind, behavior, and adult insight",
    "pulse-outline",
    ["#102028", "#081014"],
    "adult-psychology",
    false
  ),
  matureCategory(
    "mature-human-behavior",
    "Human Behavior",
    "Why we think, feel, and connect",
    "analytics-outline",
    ["#142028", "#080C10"],
    "human-behavior",
    false
  ),
  matureCategory(
    "mature-love-advice",
    "Love Advice",
    "Romance, attraction, and partnership",
    "heart-circle-outline",
    ["#241018", "#100810"],
    "love-advice",
    false
  ),
  matureCategory(
    "mature-relationship-therapy",
    "Relationship Therapy",
    "Couples work and repair conversations",
    "medkit-outline",
    ["#182028", "#0A0C12"],
    "relationship-therapy",
    false
  ),
  matureCategory(
    "mature-mens-issues",
    "Men's Issues",
    "Modern manhood and relationships",
    "male-outline",
    ["#101828", "#080810"],
    "mens-issues",
    false
  ),
  matureCategory(
    "mature-womens-issues",
    "Women's Issues",
    "Modern womanhood and connection",
    "female-outline",
    ["#281020", "#100810"],
    "womens-issues",
    false
  ),
  matureCategory(
    "mature-lgbtq-conversations",
    "LGBTQ+ Conversations",
    "Queer stories, love, and community",
    "color-palette-outline",
    ["#201830", "#0C0814"],
    "lgbtq-conversations",
    false
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
    "mature-confessions",
    "Confessions",
    "Anonymous stories and honest secrets",
    "lock-open-outline",
    ["#201418", "#0C0808"],
    "confessions",
    false
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
    "mature-after-dark-conversations",
    "After Dark Conversations",
    "Late-night adult conversations",
    "moon-outline",
    ["#1A1038", "#080612"],
    "after-dark-conversations"
  ),
  matureCategory(
    "mature-lifestyle-18",
    "Lifestyle 18+",
    "Adult lifestyle, nightlife, and culture",
    "wine-outline",
    ["#241820", "#100C10"],
    "lifestyle-18",
    false
  ),
  matureCategory(
    "mature-late-night-talk",
    "Late Night Talk",
    "Grown conversations after hours",
    "cloudy-night-outline",
    ["#181028", "#080610"],
    "late-night-talk",
    false
  ),
  matureCategory(
    "mature-unfiltered-interviews",
    "Unfiltered Interviews",
    "Raw conversations without filters",
    "mic-outline",
    ["#201418", "#0C0808"],
    "unfiltered-interviews"
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
