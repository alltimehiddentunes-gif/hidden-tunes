import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import { EMOTIONAL_DISCOVERY_SHORTCUTS as LAUNCH_SHORTCUTS } from "./launchEmotionalWorlds";

export type EmotionalDiscoveryShortcut = {
  id: string;
  title: string;
  query: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

export const EMOTIONAL_DISCOVERY_SHORTCUTS: EmotionalDiscoveryShortcut[] =
  LAUNCH_SHORTCUTS;
