import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import { COLORS } from "./theme";

export type HomeMoreHubShortcut = {
  key: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  route: string;
  color: string;
};

export const HOME_MORE_HUB_SHORTCUTS: HomeMoreHubShortcut[] = [
  {
    key: "more-tv",
    icon: "videocam-outline",
    title: "TV",
    subtitle: "Hidden Tunes video rooms",
    route: "/youtube-feed",
    color: COLORS.cyan,
  },
  {
    key: "more-worlds",
    icon: "heart-outline",
    title: "Feelings",
    subtitle: "Emotional listening worlds",
    route: "/worlds",
    color: "rgba(192,132,252,0.95)",
  },
  {
    key: "more-search",
    icon: "search-outline",
    title: "Search",
    subtitle: "Find anything",
    route: "/search",
    color: COLORS.cyan,
  },
  {
    key: "more-queue",
    icon: "list-outline",
    title: "Queue",
    subtitle: "Up next",
    route: "/queue",
    color: COLORS.pink,
  },
  {
    key: "more-library",
    icon: "albums-outline",
    title: "Library",
    subtitle: "Your collection",
    route: "/library",
    color: COLORS.primaryGlow,
  },
  {
    key: "more-playlists",
    icon: "musical-notes-outline",
    title: "Playlists",
    subtitle: "Curated sets",
    route: "/playlists",
    color: COLORS.primary,
  },
];
