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
  /** When true, card stays visible but must not navigate (no route screen yet). */
  disabled?: boolean;
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
    color: "#C084FC",
  },
  {
    key: "more-motivation",
    icon: "flame-outline",
    title: "Motivationals",
    subtitle: "Speeches and focus streams",
    route: "/motivation",
    color: "#FB923C",
  },
  {
    key: "more-lectures",
    icon: "school-outline",
    title: "Lectures",
    subtitle: "Courses and educational sessions",
    route: "/lectures",
    color: COLORS.cyan,
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
