import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MoodRoomGradient } from "../utils/moodRooms";
import type { PodcastCategory } from "../types/podcast";

export type PodcastCategoryDef = PodcastCategory & {
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  parentId?: string;
  children?: PodcastCategoryDef[];
};

const GRADIENT_PURPLE: MoodRoomGradient = ["#241028", "#100810"];
const GRADIENT_BLUE: MoodRoomGradient = ["#1A1830", "#0A0818"];
const GRADIENT_PINK: MoodRoomGradient = ["#2A1420", "#100810"];
const GRADIENT_MATURE: MoodRoomGradient = ["#2A1018", "#120608"];

function leaf(
  id: string,
  title: string,
  description: string,
  icon: ComponentProps<typeof Ionicons>["name"],
  gradient: MoodRoomGradient,
  matureOnly = false,
  parentId?: string
): PodcastCategoryDef {
  return { id, title, description, icon, gradient, matureOnly, parentId };
}

export const PODCAST_HOME_LANES = [
  { id: "featured-podcasts", title: "Featured Podcasts" },
  { id: "trending-podcasts", title: "Trending Podcasts" },
  { id: "new-episodes", title: "New Episodes" },
  { id: "popular-shows", title: "Popular Shows" },
  { id: "recommended-for-you", title: "Recommended For You" },
] as const;

const MUSIC_CHILDREN: PodcastCategoryDef[] = [
  leaf("artist-interviews", "Artist Interviews", "Conversations with creators", "mic-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("album-stories", "Album Stories", "Deep dives into albums", "disc-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("music-history", "Music History", "Stories behind the sound", "time-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("afrobeats", "Afrobeats", "Afrobeats culture and creators", "musical-notes-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("gospel-worship", "Gospel / Worship", "Faith and worship stories", "heart-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("hip-hop", "Hip-Hop", "Hip-hop interviews and culture", "headset-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("rnb", "R&B", "R&B storytelling and interviews", "radio-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("dancehall", "Dancehall", "Dancehall culture and voices", "pulse-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("amapiano", "Amapiano", "Amapiano scenes and stories", "sparkles-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("jazz", "Jazz", "Jazz history and sessions", "cafe-outline", GRADIENT_PURPLE, false, "music-podcasts"),
  leaf("electronic", "Electronic", "Electronic music culture", "hardware-chip-outline", GRADIENT_PURPLE, false, "music-podcasts"),
];

const EMOTIONAL_CHILDREN: PodcastCategoryDef[] = [
  leaf("heartbreak-recovery", "Heartbreak Recovery", "Healing after loss", "heart-dislike-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("midnight-drives", "Midnight Drives", "Late-night listening stories", "moon-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("healing-journey", "Healing Journey", "Recovery and reflection", "leaf-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("focus-chamber", "Focus Chamber", "Deep focus narratives", "eye-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("afro-heat", "Afro Heat", "High-energy Afro moods", "flame-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("romantic-escape", "Romantic Escape", "Love and connection", "heart-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("deep-waters", "Deep Waters", "Calm and contemplative", "water-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("rainy-window", "Rainy Window", "Soft rainy-day stories", "rainy-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("worship-sanctuary", "Worship Sanctuary", "Spiritual calm", "sunny-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
  leaf("hidden-treasures", "Hidden Treasures", "Undiscovered voices", "diamond-outline", GRADIENT_PINK, false, "emotional-worlds-podcasts"),
];

const LIFESTYLE_CHILDREN: PodcastCategoryDef[] = [
  leaf("motivation", "Motivation", "Drive and discipline", "flash-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("relationships", "Relationships", "Connection and communication", "people-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("self-growth", "Self Growth", "Personal development", "trending-up-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("business", "Business", "Builders and operators", "briefcase-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("money", "Money", "Finance and wealth", "cash-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("health", "Health", "Wellness and care", "fitness-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("fitness", "Fitness", "Training and movement", "barbell-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("comedy", "Comedy", "Laughs and stories", "happy-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("culture", "Culture", "Arts and identity", "color-palette-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
  leaf("society", "Society", "News and social issues", "globe-outline", GRADIENT_BLUE, false, "lifestyle-podcasts"),
];

const GLOBAL_CHILDREN: PodcastCategoryDef[] = [
  leaf("africa", "Africa", "Voices from across Africa", "earth-outline", GRADIENT_BLUE, false, "global-podcasts"),
  leaf("europe", "Europe", "European perspectives", "earth-outline", GRADIENT_BLUE, false, "global-podcasts"),
  leaf("north-america", "North America", "North American shows", "earth-outline", GRADIENT_BLUE, false, "global-podcasts"),
  leaf("south-america", "South America", "Latin American voices", "earth-outline", GRADIENT_BLUE, false, "global-podcasts"),
  leaf("caribbean", "Caribbean", "Caribbean culture", "earth-outline", GRADIENT_BLUE, false, "global-podcasts"),
  leaf("asia", "Asia", "Asian perspectives", "earth-outline", GRADIENT_BLUE, false, "global-podcasts"),
  leaf("middle-east", "Middle East", "Middle Eastern voices", "earth-outline", GRADIENT_BLUE, false, "global-podcasts"),
];

const LANGUAGE_CHILDREN: PodcastCategoryDef[] = [
  leaf("english", "English", "English-language shows", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
  leaf("german", "German", "Deutsch podcasts", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
  leaf("french", "French", "Podcasts en français", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
  leaf("spanish", "Spanish", "Podcasts en español", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
  leaf("twi", "Twi", "Twi-language shows", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
  leaf("yoruba", "Yoruba", "Yoruba-language shows", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
  leaf("igbo", "Igbo", "Igbo-language shows", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
  leaf("hausa", "Hausa", "Hausa-language shows", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
  leaf("pidgin", "Pidgin", "Pidgin-language shows", "language-outline", GRADIENT_BLUE, false, "language-podcasts"),
];

const MATURE_CHILDREN: PodcastCategoryDef[] = [
  leaf("mature-relationships", "Mature Relationships", "Adult relationship talk", "heart-outline", GRADIENT_MATURE, true, "mature-podcasts"),
  leaf("adult-comedy", "Adult Comedy", "Explicit comedy", "happy-outline", GRADIENT_MATURE, true, "mature-podcasts"),
  leaf("sex-education", "Sex Education", "Adult education", "school-outline", GRADIENT_MATURE, true, "mature-podcasts"),
  leaf("mature-storytelling", "Mature Storytelling", "Explicit narratives", "book-outline", GRADIENT_MATURE, true, "mature-podcasts"),
  leaf("night-talk", "Night Talk", "Late-night adult talk", "moon-outline", GRADIENT_MATURE, true, "mature-podcasts"),
  leaf("confessions", "Confessions", "Anonymous adult stories", "chatbubble-outline", GRADIENT_MATURE, true, "mature-podcasts"),
  leaf("dating-after-dark", "Dating After Dark", "Adult dating talk", "flame-outline", GRADIENT_MATURE, true, "mature-podcasts"),
  leaf("explicit-interviews", "Explicit Interviews", "Uncensored conversations", "mic-outline", GRADIENT_MATURE, true, "mature-podcasts"),
];

export const PODCAST_ROOT_SECTIONS: PodcastCategoryDef[] = [
  {
    id: "music-podcasts",
    title: "Music Podcasts",
    description: "Artist stories, album deep dives, and music culture",
    icon: "musical-notes-outline",
    gradient: GRADIENT_PURPLE,
    matureOnly: false,
    children: MUSIC_CHILDREN,
  },
  {
    id: "emotional-worlds-podcasts",
    title: "Emotional Worlds Podcasts",
    description: "Mood-shaped listening rooms in podcast form",
    icon: "sparkles-outline",
    gradient: GRADIENT_PINK,
    matureOnly: false,
    children: EMOTIONAL_CHILDREN,
  },
  {
    id: "lifestyle-podcasts",
    title: "Lifestyle Podcasts",
    description: "Motivation, culture, comedy, and everyday life",
    icon: "cafe-outline",
    gradient: GRADIENT_BLUE,
    matureOnly: false,
    children: LIFESTYLE_CHILDREN,
  },
  {
    id: "global-podcasts",
    title: "Global Podcasts",
    description: "Voices from every region",
    icon: "globe-outline",
    gradient: GRADIENT_BLUE,
    matureOnly: false,
    children: GLOBAL_CHILDREN,
  },
  {
    id: "language-podcasts",
    title: "Language Podcasts",
    description: "Shows by language",
    icon: "language-outline",
    gradient: GRADIENT_BLUE,
    matureOnly: false,
    children: LANGUAGE_CHILDREN,
  },
  {
    id: "mature-podcasts",
    title: "Mature Podcasts 18+",
    description: "Explicit and adult content behind an age gate",
    icon: "lock-closed-outline",
    gradient: GRADIENT_MATURE,
    matureOnly: true,
    children: MATURE_CHILDREN,
  },
];

const ALL_LEAF_CATEGORIES: PodcastCategoryDef[] = [
  ...MUSIC_CHILDREN,
  ...EMOTIONAL_CHILDREN,
  ...LIFESTYLE_CHILDREN,
  ...GLOBAL_CHILDREN,
  ...LANGUAGE_CHILDREN,
  ...MATURE_CHILDREN,
];

const CATEGORY_MAP = new Map<string, PodcastCategoryDef>();
for (const section of PODCAST_ROOT_SECTIONS) {
  CATEGORY_MAP.set(section.id, section);
}
for (const leafCat of ALL_LEAF_CATEGORIES) {
  CATEGORY_MAP.set(leafCat.id, leafCat);
}

export function getPodcastCategory(categoryId: string) {
  return CATEGORY_MAP.get(categoryId) || null;
}

export function getPodcastCategories(includeMature: boolean) {
  return PODCAST_ROOT_SECTIONS.filter((section) => includeMature || !section.matureOnly);
}

export function getBrowsablePodcastCategories(includeMature: boolean) {
  return ALL_LEAF_CATEGORIES.filter((cat) => includeMature || !cat.matureOnly);
}

export function resolvePodcastCategoryId(raw: string) {
  const id = String(raw || "").trim();
  return CATEGORY_MAP.has(id) ? id : "featured-podcasts";
}
