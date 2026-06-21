import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MoodRoomGradient } from "../utils/moodRooms";

export type RadioEmotionalWorld = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  tag: string;
  matchTags: string[];
  listeningRoomQuery: string;
};

export const RADIO_EMOTIONAL_WORLDS: RadioEmotionalWorld[] = [
  {
    id: "night-drive",
    title: "Night Drive Radio",
    subtitle: "Late-night lanes and smooth motion",
    icon: "moon-outline",
    gradient: ["#1A1038", "#080612"],
    tag: "jazz",
    matchTags: ["jazz", "chill", "lounge", "night", "smooth"],
    listeningRoomQuery: "late night jazz radio",
  },
  {
    id: "heartbreak-recovery",
    title: "Heartbreak Recovery Radio",
    subtitle: "Soft voices for emotional nights",
    icon: "heart-dislike-outline",
    gradient: ["#241020", "#100810"],
    tag: "soft",
    matchTags: ["soft", "ballads", "love", "soul", "easy listening"],
    listeningRoomQuery: "emotional radio",
  },
  {
    id: "sunday-worship",
    title: "Sunday Worship Radio",
    subtitle: "Praise, gospel, and sacred calm",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    tag: "christian",
    matchTags: ["christian", "gospel", "worship", "praise"],
    listeningRoomQuery: "gospel worship radio",
  },
  {
    id: "deep-focus",
    title: "Deep Focus Radio",
    subtitle: "Ambient lanes for concentration",
    icon: "pulse-outline",
    gradient: ["#102028", "#081014"],
    tag: "ambient",
    matchTags: ["ambient", "classical", "instrumental", "study", "focus"],
    listeningRoomQuery: "focus ambient radio",
  },
  {
    id: "afro-heat",
    title: "Afro Heat Radio",
    subtitle: "Afrobeat energy and continental heat",
    icon: "flame-outline",
    gradient: ["#2A1420", "#100810"],
    tag: "afrobeat",
    matchTags: ["afrobeat", "afro", "african", "amapiano", "highlife"],
    listeningRoomQuery: "afrobeat radio",
  },
  {
    id: "hidden-treasures",
    title: "Hidden Treasures Radio",
    subtitle: "Indie gems and unexpected finds",
    icon: "diamond-outline",
    gradient: ["#181828", "#0A0A14"],
    tag: "indie",
    matchTags: ["indie", "alternative", "underground", "discovery"],
    listeningRoomQuery: "indie radio",
  },
  {
    id: "world-mix",
    title: "World Mix Radio",
    subtitle: "Global voices across every border",
    icon: "globe-outline",
    gradient: ["#102030", "#080C14"],
    tag: "world",
    matchTags: ["world", "international", "global", "ethnic"],
    listeningRoomQuery: "world music radio",
  },
];

const WORLD_BY_ID = new Map(RADIO_EMOTIONAL_WORLDS.map((world) => [world.id, world]));

export function getRadioEmotionalWorld(id: string) {
  return WORLD_BY_ID.get(String(id || "").trim()) || null;
}

export function stationMatchesEmotionalWorld(
  stationTags: string[],
  world: RadioEmotionalWorld
) {
  const normalized = stationTags.map((tag) => tag.toLowerCase());
  return world.matchTags.some((needle) =>
    normalized.some(
      (tag) => tag === needle || tag.includes(needle) || needle.includes(tag)
    )
  );
}
