import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

export type EmotionalDiscoveryShortcut = {
  id: string;
  title: string;
  query: string;
  icon: ComponentProps<typeof Ionicons>["name"];
};

export const EMOTIONAL_DISCOVERY_SHORTCUTS: EmotionalDiscoveryShortcut[] = [
  {
    id: "heartbreak",
    title: "Heartbreak",
    query: "heartbreak emotional music",
    icon: "heart-dislike-outline",
  },
  {
    id: "healing",
    title: "Healing",
    query: "healing calm music",
    icon: "leaf-outline",
  },
  {
    id: "late-night",
    title: "Late Night",
    query: "late night mood music",
    icon: "moon-outline",
  },
  {
    id: "focus",
    title: "Focus",
    query: "focus concentration music",
    icon: "pulse-outline",
  },
  {
    id: "party-energy",
    title: "Party Energy",
    query: "party energy dance music",
    icon: "flash-outline",
  },
  {
    id: "romantic",
    title: "Romantic",
    query: "romantic love songs",
    icon: "heart-outline",
  },
  {
    id: "nostalgic",
    title: "Nostalgic",
    query: "nostalgic throwback music",
    icon: "time-outline",
  },
  {
    id: "calm",
    title: "Calm",
    query: "calm relaxing music",
    icon: "water-outline",
  },
  {
    id: "deep-feelings",
    title: "Deep Feelings",
    query: "deep emotional music",
    icon: "infinite-outline",
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    query: "hidden gems underrated songs",
    icon: "diamond-outline",
  },
];
