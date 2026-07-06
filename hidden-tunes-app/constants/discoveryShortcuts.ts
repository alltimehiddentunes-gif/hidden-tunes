import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import { COLORS } from "./theme";

export type DiscoveryShortcut = {
  key: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  color: string;
  route: string;
};

/** Frozen Home shortcut grid — never add tiles here. */
export const HOME_DISCOVERY_SHORTCUTS: DiscoveryShortcut[] = [
  {
    key: "home-radio",
    icon: "radio-outline",
    title: "Radio",
    color: COLORS.primary,
    route: "/stations",
  },
  {
    key: "home-podcasts",
    icon: "mic-outline",
    title: "Podcasts",
    color: "rgba(244,114,182,0.95)",
    route: "/podcasts",
  },
  {
    key: "home-audiobooks",
    icon: "book-outline",
    title: "Audiobooks",
    color: "rgba(251,191,36,0.95)",
    route: "/audiobooks",
  },
  {
    key: "home-more",
    icon: "grid-outline",
    title: "More",
    color: COLORS.cyan,
    route: "/discovery",
  },
];

/** Discovery Hub — all modules beyond the frozen Home grid. */
export const MORE_HUB_SHORTCUTS: DiscoveryShortcut[] = [
  {
    key: "more-tv",
    icon: "videocam-outline",
    title: "TV",
    color: COLORS.cyan,
    route: "/videos",
  },
  {
    key: "more-lectures",
    icon: "school-outline",
    title: "Lectures / Tutorials",
    color: "rgba(96,165,250,0.95)",
    route: "/lectures",
  },
  {
    key: "more-motivation",
    icon: "flame-outline",
    title: "Motivation",
    color: "rgba(251,146,60,0.95)",
    route: "/motivation",
  },
  {
    key: "more-search",
    icon: "search",
    title: "Search",
    color: COLORS.cyan,
    route: "/search",
  },
  {
    key: "more-queue",
    icon: "list",
    title: "Queue",
    color: COLORS.pink,
    route: "/queue",
  },
  {
    key: "more-feelings",
    icon: "heart",
    title: "Feelings",
    color: "rgba(192,132,252,0.95)",
    route: "/explore",
  },
];
