import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MoodRoomGradient } from "../utils/moodRooms";
import { RADIO_CATALOG_TARGETS } from "./radioFoundation";

export type RadioEmotionalWorld = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  tag: string;
  matchTags: string[];
  subGenres: string[];
  catalogTarget: number;
  listeningRoomQuery: string;
};

export const RADIO_EMOTIONAL_WORLDS: RadioEmotionalWorld[] = [
  {
    id: "night-drive",
    title: "Night Drive Radio",
    subtitle: "Synthwave · Chill Electronic · Late Night Jazz · Smooth R&B · Ambient",
    icon: "moon-outline",
    gradient: ["#1A1038", "#080612"],
    tag: "chill",
    matchTags: [
      "synthwave",
      "chill",
      "electronic",
      "jazz",
      "r&b",
      "rnb",
      "smooth",
      "ambient",
      "lounge",
      "night",
    ],
    subGenres: ["Synthwave", "Chill Electronic", "Late Night Jazz", "Smooth R&B", "Ambient Radio"],
    catalogTarget: RADIO_CATALOG_TARGETS.nightDrive,
    listeningRoomQuery: "late night chill radio",
  },
  {
    id: "heartbreak-recovery",
    title: "Heartbreak Recovery Radio",
    subtitle: "Acoustic · Soft Pop · Soul · Healing Music · Reflection",
    icon: "heart-dislike-outline",
    gradient: ["#241020", "#100810"],
    tag: "acoustic",
    matchTags: [
      "acoustic",
      "soft",
      "pop",
      "soul",
      "healing",
      "ballads",
      "love",
      "easy listening",
      "reflection",
    ],
    subGenres: ["Acoustic", "Soft Pop", "Soul", "Healing Music", "Reflection"],
    catalogTarget: RADIO_CATALOG_TARGETS.heartbreakRecovery,
    listeningRoomQuery: "heartbreak acoustic radio",
  },
  {
    id: "sunday-worship",
    title: "Sunday Worship Radio",
    subtitle: "Gospel · Christian · Worship · Praise · Sermons",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    tag: "gospel",
    matchTags: ["gospel", "christian", "worship", "praise", "sermon", "faith"],
    subGenres: ["Gospel", "Christian", "Worship", "Praise", "Sermons"],
    catalogTarget: RADIO_CATALOG_TARGETS.sundayWorship,
    listeningRoomQuery: "gospel worship radio",
  },
  {
    id: "deep-focus",
    title: "Deep Focus Radio",
    subtitle: "LoFi · Ambient · Classical · Study Music · Instrumental",
    icon: "pulse-outline",
    gradient: ["#102028", "#081014"],
    tag: "lofi",
    matchTags: [
      "lofi",
      "lo-fi",
      "ambient",
      "classical",
      "study",
      "instrumental",
      "focus",
      "concentration",
    ],
    subGenres: ["LoFi", "Ambient", "Classical", "Study Music", "Instrumental"],
    catalogTarget: RADIO_CATALOG_TARGETS.deepFocus,
    listeningRoomQuery: "focus study radio",
  },
  {
    id: "afro-heat",
    title: "Afro Heat Radio",
    subtitle: "Afrobeats · Amapiano · Highlife · Afro House · African Urban",
    icon: "flame-outline",
    gradient: ["#2A1420", "#100810"],
    tag: "afrobeat",
    matchTags: [
      "afrobeat",
      "afrobeats",
      "amapiano",
      "highlife",
      "afro house",
      "african",
      "afro",
    ],
    subGenres: ["Afrobeats", "Amapiano", "Highlife", "Afro House", "African Urban"],
    catalogTarget: RADIO_CATALOG_TARGETS.afroHeat,
    listeningRoomQuery: "afrobeat radio",
  },
  {
    id: "hidden-treasures",
    title: "Hidden Treasures Radio",
    subtitle: "Undiscovered stations · Small stations · Regional gems",
    icon: "diamond-outline",
    gradient: ["#181828", "#0A0A14"],
    tag: "indie",
    matchTags: [
      "indie",
      "alternative",
      "underground",
      "community",
      "local",
      "regional",
      "discovery",
    ],
    subGenres: ["Undiscovered", "Small Stations", "Regional Gems"],
    catalogTarget: RADIO_CATALOG_TARGETS.hiddenTreasures,
    listeningRoomQuery: "indie discovery radio",
  },
  {
    id: "world-mix",
    title: "World Mix Radio",
    subtitle: "Global voices · International · World music",
    icon: "globe-outline",
    gradient: ["#102030", "#080C14"],
    tag: "world",
    matchTags: ["world", "international", "global", "ethnic", "folk"],
    subGenres: ["World Music", "International", "Global Voices"],
    catalogTarget: 200,
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
