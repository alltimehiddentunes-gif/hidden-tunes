import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { PodcastShowsQuery } from "../services/podcastCatalogApi";
import type { MoodRoomGradient } from "./moodRooms";

export const HIDDEN_TUNES_PODCASTS_LABEL = "Hidden Tunes Podcasts";

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
};

function categoryConfig(
  id: string,
  title: string,
  subtitle: string,
  icon: ComponentProps<typeof Ionicons>["name"],
  gradient: MoodRoomGradient,
  emptyHint: string
): LaunchPodcastCategory {
  return {
    id,
    title,
    subtitle,
    icon,
    gradient,
    catalogQuery: { category: title },
    fallbackQuery: { q: title },
    emptyTitle: `${title} is warming up`,
    emptyMessage: `Hidden Tunes is syncing ${emptyHint}. Try another room or pull to refresh.`,
  };
}

export const LAUNCH_PODCAST_CATEGORIES: LaunchPodcastCategory[] = [
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
    "finance",
    "Finance",
    "Money, markets, and wealth mindset",
    "cash-outline",
    ["#142018", "#08100C"],
    "finance shows"
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
    "news",
    "News",
    "Headlines and conversation you can trust",
    "newspaper-outline",
    ["#201818", "#0C0808"],
    "news shows"
  ),
  categoryConfig(
    "sports",
    "Sports",
    "Game talk, culture, and competition",
    "football-outline",
    ["#142820", "#081410"],
    "sports shows"
  ),
  categoryConfig(
    "faith",
    "Faith",
    "Spiritual growth and sacred calm",
    "sparkles-outline",
    ["#1A1830", "#0A0818"],
    "faith shows"
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
    "motivation",
    "Motivation",
    "Momentum, mindset, and daily fuel",
    "flame-outline",
    ["#281418", "#100808"],
    "motivation shows"
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
    "dating",
    "Dating",
    "Modern dating with Hidden Tunes voice",
    "heart-outline",
    ["#2A1420", "#100810"],
    "dating shows"
  ),
  categoryConfig(
    "marriage",
    "Marriage",
    "Partnership, commitment, and repair",
    "infinite-outline",
    ["#201820", "#0C0810"],
    "marriage shows"
  ),
  categoryConfig(
    "family",
    "Family",
    "Home, parenting, and togetherness",
    "home-outline",
    ["#241810", "#100C08"],
    "family shows"
  ),
  categoryConfig(
    "breakup-recovery",
    "Breakup Recovery",
    "Healing, closure, and fresh starts",
    "bandage-outline",
    ["#181820", "#0A0A12"],
    "breakup recovery shows"
  ),
  categoryConfig(
    "communication",
    "Communication",
    "Words, listening, and understanding",
    "chatbubbles-outline",
    ["#142028", "#080C12"],
    "communication shows"
  ),
  categoryConfig(
    "personal-development",
    "Personal Development",
    "Growth habits and better you energy",
    "trending-up-outline",
    ["#101828", "#080C14"],
    "personal development shows"
  ),
  categoryConfig(
    "adult-conversations",
    "Adult Conversations",
    "Mature talk curated for Hidden Tunes",
    "eye-outline",
    ["#201418", "#0C0808"],
    "adult conversation shows"
  ),
  categoryConfig(
    "human-psychology",
    "Human Psychology",
    "Mind patterns, behavior, and insight",
    "bulb-outline",
    ["#181828", "#0A0A14"],
    "psychology shows"
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
    "african-business",
    "African Business",
    "Enterprise, hustle, and African markets",
    "business-outline",
    ["#241810", "#100C08"],
    "African business shows"
  ),
  categoryConfig(
    "african-culture",
    "African Culture",
    "Heritage, art, and cultural depth",
    "color-palette-outline",
    ["#201828", "#0C0814"],
    "African culture shows"
  ),
  categoryConfig(
    "artist-interviews",
    "Artist Interviews",
    "Creators, craft, and studio stories",
    "mic-outline",
    ["#241028", "#100810"],
    "artist interview shows"
  ),
  categoryConfig(
    "behind-the-music",
    "Behind The Music",
    "Industry rooms and making-of stories",
    "musical-notes-outline",
    ["#181828", "#0A0A14"],
    "behind the music shows"
  ),
];

export function getLaunchPodcastCategory(categoryId: string) {
  const safeId = String(categoryId || "").trim().toLowerCase();
  return LAUNCH_PODCAST_CATEGORIES.find((category) => category.id === safeId) || null;
}
