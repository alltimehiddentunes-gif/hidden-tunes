import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import { LAUNCH_PODCAST_CATEGORIES } from "./launchPodcastCategories";
import { LAUNCH_VIDEO_CATEGORIES } from "./launchVideoCategories";

export type LaunchContentChip = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  pathname: string;
  params?: Record<string, string>;
  worldId?: string;
};

export const LAUNCH_CONTENT_LABELS = {
  featuredPlaylists: "Featured Playlists",
  featuredWorlds: "Featured Worlds",
  featuredGenres: "Featured Genres",
  featuredRadios: "Featured Radios",
  featuredVideos: "Featured Videos",
  featuredPodcasts: "Featured Podcasts",
  trendingNow: "Trending Now",
  newReleases: "New Releases",
  hiddenPicks: "Hidden Picks",
  continueExploring: "Continue Exploring",
} as const;

export const CONTINUE_EXPLORING_CHIPS: LaunchContentChip[] = [
  {
    id: "explore-tab",
    title: "Explore",
    subtitle: "Discovery rooms",
    icon: "compass-outline",
    pathname: "/(tabs)/explore",
  },
  {
    id: "hidden-tunes-videos",
    title: "Videos",
    subtitle: "Hidden Tunes video rooms",
    icon: "videocam-outline",
    pathname: "/videos",
  },
  {
    id: "hidden-tunes-podcasts",
    title: "Podcasts",
    subtitle: "Hidden Tunes podcast rooms",
    icon: "mic-outline",
    pathname: "/podcasts",
  },
  {
    id: "hidden-tunes-radio",
    title: "Radio",
    subtitle: "Live listening rooms",
    icon: "radio-outline",
    pathname: "/stations",
  },
  {
    id: "personal-radio",
    title: "Smart Radio",
    subtitle: "Song listening room",
    icon: "sparkles-outline",
    pathname: "/radio",
    params: {
      title: "Hidden Tunes Radio",
      query: "Hidden Tunes trending",
    },
  },
  {
    id: "search-genres",
    title: "Search",
    subtitle: "Find anything in Hidden Tunes",
    icon: "search-outline",
    pathname: "/(tabs)/search",
  },
];

export function buildFeaturedVideoChips(limit = 6): LaunchContentChip[] {
  return LAUNCH_VIDEO_CATEGORIES.slice(0, limit).map((category) => ({
    id: `video-${category.id}`,
    title: category.title,
    subtitle: category.subtitle,
    icon: category.icon,
    pathname: `/videos/${category.id}`,
  }));
}

export function buildFeaturedPodcastChips(limit = 6): LaunchContentChip[] {
  return LAUNCH_PODCAST_CATEGORIES.slice(0, limit).map((category) => ({
    id: `podcast-${category.id}`,
    title: category.title,
    subtitle: category.subtitle,
    icon: category.icon,
    pathname: `/podcasts/${category.id}`,
  }));
}
