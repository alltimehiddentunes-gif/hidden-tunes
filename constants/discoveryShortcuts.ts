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

/** Frozen Home shortcut grid — metadata/navigation only. */
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
    route: "/more",
  },
];
