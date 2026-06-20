import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import {
  songHasNormalizedGenre,
} from "./genreNormalization";
import { normalizeMoodKey, songMatchesMoodRoom, type MoodRoomGradient } from "./moodRooms";

export type LaunchWorldResolverType = "mood" | "genre" | "category";

export type LaunchEmotionalWorld = {
  id: string;
  title: string;
  subtitle: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  gradient: MoodRoomGradient;
  resolverType: LaunchWorldResolverType;
  genreTitles?: string[];
  moodAliases?: string[];
  categoryTokens?: string[];
  searchQuery: string;
  emptyTitle: string;
  emptyMessage: string;
  minPreviewSongs: number;
};

type MatchableSong = {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  genre?: unknown;
  mood?: unknown;
  moodGenre?: unknown;
  tags?: unknown;
  description?: unknown;
  genres?: unknown;
  primaryGenre?: unknown;
};

export const LAUNCH_EMOTIONAL_WORLDS: LaunchEmotionalWorld[] = [
  {
    id: "night-drive",
    title: "Night Drive",
    subtitle: "Music for the road after dark",
    icon: "car-outline",
    gradient: ["#14102A", "#06040E"],
    resolverType: "category",
    moodAliases: [
      "night drive",
      "driving",
      "midnight soul",
      "sunset drive",
      "late night",
      "after hours",
    ],
    categoryTokens: ["night drive", "driving", "road", "highway"],
    searchQuery: "night drive late night driving music",
    emptyTitle: "Night Drive is warming up",
    emptyMessage:
      "Try Hidden Tunes search for late-night moods, or browse Jazz and Lo-Fi rooms.",
    minPreviewSongs: 1,
  },
  {
    id: "worship-sanctuary",
    title: "Worship Sanctuary",
    subtitle: "Praise, peace, and sacred calm",
    icon: "sparkles-outline",
    gradient: ["#1A1830", "#0A0818"],
    resolverType: "category",
    genreTitles: ["Gospel"],
    moodAliases: [
      "worship",
      "praise",
      "spiritual calm",
      "sacred voices",
      "gospel",
      "sanctuary",
    ],
    categoryTokens: ["worship", "praise", "gospel", "sacred", "spiritual"],
    searchQuery: "worship gospel praise spiritual music",
    emptyTitle: "Worship Sanctuary is warming up",
    emptyMessage:
      "Browse Gospel in Hidden Tunes genres, or search for worship and praise.",
    minPreviewSongs: 1,
  },
  {
    id: "afro-heat",
    title: "Afro Heat",
    subtitle: "Afrobeats energy and fusion fire",
    icon: "flame-outline",
    gradient: ["#2A1420", "#100810"],
    resolverType: "genre",
    genreTitles: ["Afrobeats"],
    searchQuery: "afrobeats afrobeat energy",
    emptyTitle: "Afro Heat is warming up",
    emptyMessage:
      "Explore Afrobeats and World genres in Hidden Tunes while this room fills.",
    minPreviewSongs: 1,
  },
  {
    id: "deep-focus",
    title: "Deep Focus",
    subtitle: "Clean sound for concentration",
    icon: "pulse-outline",
    gradient: ["#101C2E", "#080C14"],
    resolverType: "category",
    genreTitles: ["Lo-Fi", "Instrumental", "Ambient"],
    moodAliases: ["focus", "focus flow", "concentration", "study", "deep work"],
    categoryTokens: ["focus", "concentration", "study", "work"],
    searchQuery: "focus concentration lo-fi instrumental",
    emptyTitle: "Deep Focus is warming up",
    emptyMessage:
      "Try Lo-Fi or Instrumental genres, or search for focus and study moods.",
    minPreviewSongs: 1,
  },
  {
    id: "heartbreak-recovery",
    title: "Heartbreak Recovery",
    subtitle: "Emotional songs for letting go",
    icon: "heart-dislike-outline",
    gradient: ["#1E1428", "#0C0810"],
    resolverType: "mood",
    moodAliases: [
      "heartbreak",
      "heartbreak soul",
      "breakup",
      "recovery",
      "healing",
      "deep reflection",
    ],
    searchQuery: "heartbreak emotional recovery music",
    emptyTitle: "Heartbreak Recovery is warming up",
    emptyMessage:
      "Browse Soul and Blues genres, or search for emotional and healing moods.",
    minPreviewSongs: 1,
  },
  {
    id: "sunday-morning",
    title: "Sunday Morning",
    subtitle: "Gentle gospel and soul for slow mornings",
    icon: "sunny-outline",
    gradient: ["#1A2030", "#0A1018"],
    resolverType: "category",
    genreTitles: ["Gospel", "Soul"],
    moodAliases: ["calm", "peaceful", "worship", "sunday", "morning", "spiritual calm"],
    categoryTokens: ["sunday", "morning", "gentle", "slow morning"],
    searchQuery: "sunday morning gospel soul calm",
    emptyTitle: "Sunday Morning is warming up",
    emptyMessage:
      "Try Gospel or Soul genres with calm moods, or search for peaceful morning music.",
    minPreviewSongs: 1,
  },
  {
    id: "country-roads",
    title: "Country Roads",
    subtitle: "Stories with room to breathe",
    icon: "navigate-outline",
    gradient: ["#241810", "#100C08"],
    resolverType: "genre",
    genreTitles: ["Country"],
    searchQuery: "country americana storytelling",
    emptyTitle: "Country Roads is warming up",
    emptyMessage:
      "Browse Country and Folk genres while this room gathers more Hidden Tunes tracks.",
    minPreviewSongs: 1,
  },
  {
    id: "gym-energy",
    title: "Gym Energy",
    subtitle: "High-energy songs for movement",
    icon: "barbell-outline",
    gradient: ["#2A1038", "#120818"],
    resolverType: "category",
    genreTitles: ["EDM", "Hip-Hop", "Pop"],
    moodAliases: ["party energy", "energy", "workout", "gym", "movement", "dance"],
    categoryTokens: ["gym", "workout", "energy", "movement", "power"],
    searchQuery: "workout gym energy dance music",
    emptyTitle: "Gym Energy is warming up",
    emptyMessage:
      "Try EDM, Hip-Hop, or Pop genres, or search for high-energy workout moods.",
    minPreviewSongs: 1,
  },
  {
    id: "late-night-vibes",
    title: "Late Night Vibes",
    subtitle: "Soft songs for quiet hours",
    icon: "moon-outline",
    gradient: ["#1A1038", "#080612"],
    resolverType: "mood",
    moodAliases: [
      "late night",
      "midnight",
      "midnight soul",
      "late night jazz",
      "after hours",
      "rainy night blues",
    ],
    searchQuery: "late night jazz blues mood music",
    emptyTitle: "Late Night Vibes is warming up",
    emptyMessage:
      "Browse Jazz and Blues genres, or search for late-night and midnight moods.",
    minPreviewSongs: 1,
  },
  {
    id: "feel-good-friday",
    title: "Feel Good Friday",
    subtitle: "Upbeat Hidden Tunes to lift the week",
    icon: "happy-outline",
    gradient: ["#2A2030", "#121018"],
    resolverType: "category",
    genreTitles: ["Pop", "Funk", "Disco"],
    moodAliases: ["feel good", "upbeat", "party", "happy", "sunshine", "celebration"],
    categoryTokens: ["feel good", "friday", "upbeat", "happy", "celebration"],
    searchQuery: "feel good upbeat happy pop music",
    emptyTitle: "Feel Good Friday is warming up",
    emptyMessage:
      "Try Pop or Funk genres, or search for upbeat and feel-good moods.",
    minPreviewSongs: 1,
  },
];

const WORLD_BY_ID = new Map(LAUNCH_EMOTIONAL_WORLDS.map((world) => [world.id, world]));
const WORLD_BY_TITLE_KEY = new Map(
  LAUNCH_EMOTIONAL_WORLDS.map((world) => [normalizeMoodKey(world.title), world])
);

export function getLaunchWorldById(id: string) {
  return WORLD_BY_ID.get(String(id || "").trim()) || null;
}

export function getLaunchWorldByTitle(title: string) {
  return WORLD_BY_TITLE_KEY.get(normalizeMoodKey(title)) || null;
}

function collectSongTextTokens(song: MatchableSong): string[] {
  const values = [
    song.mood,
    song.moodGenre,
    song.genre,
    song.title,
    song.description,
    ...(Array.isArray(song.tags) ? song.tags : []),
  ];

  return values
    .map((value) => normalizeMoodKey(value))
    .filter(Boolean);
}

function tokenMatchesAliases(token: string, aliases: string[]) {
  if (!token) return false;

  return aliases.some((alias) => {
    const aliasKey = normalizeMoodKey(alias);
    if (!aliasKey) return false;
    if (token === aliasKey) return true;
    if (aliasKey.length < 4 || token.length < 4) return false;
    return token.includes(aliasKey) || aliasKey.includes(token);
  });
}

function songMatchesMoodAliases(song: MatchableSong, aliases: string[]) {
  return aliases.some((alias) => {
    const pseudoRoom = {
      id: "launch",
      title: alias,
      subtitle: "",
      aliases: [alias],
      gradient: ["#000", "#000"] as MoodRoomGradient,
    };

    return songMatchesMoodRoom(song, pseudoRoom);
  });
}

function songMatchesCategoryWorld(song: MatchableSong, world: LaunchEmotionalWorld) {
  const genreHit =
    world.genreTitles?.some((genre) => songHasNormalizedGenre(song, genre)) ?? false;
  const moodHit = world.moodAliases?.length
    ? songMatchesMoodAliases(song, world.moodAliases)
    : false;
  const tokenHit = world.categoryTokens?.length
    ? collectSongTextTokens(song).some((token) =>
        tokenMatchesAliases(token, world.categoryTokens || [])
      )
    : false;

  if (world.id === "sunday-morning") {
    const genreMatch =
      songHasNormalizedGenre(song, "Gospel") || songHasNormalizedGenre(song, "Soul");
    const calmMatch =
      songMatchesMoodAliases(song, world.moodAliases || []) ||
      collectSongTextTokens(song).some((token) =>
        tokenMatchesAliases(token, world.categoryTokens || [])
      );

    return genreMatch && calmMatch;
  }

  if (world.id === "worship-sanctuary") {
    return (
      songHasNormalizedGenre(song, "Gospel") ||
      songMatchesMoodAliases(song, world.moodAliases || []) ||
      collectSongTextTokens(song).some((token) =>
        tokenMatchesAliases(token, world.categoryTokens || [])
      )
    );
  }

  if (world.id === "deep-focus") {
    return genreHit || moodHit;
  }

  if (world.id === "gym-energy") {
    return genreHit || moodHit || tokenHit;
  }

  if (world.id === "feel-good-friday") {
    return genreHit || moodHit || tokenHit;
  }

  if (world.id === "night-drive") {
    return moodHit || tokenHit || songHasNormalizedGenre(song, "Jazz");
  }

  return genreHit || moodHit || tokenHit;
}

export function songMatchesLaunchWorld(song: MatchableSong, world: LaunchEmotionalWorld) {
  if (world.resolverType === "genre") {
    return (
      world.genreTitles?.some((genre) => songHasNormalizedGenre(song, genre)) ?? false
    );
  }

  if (world.resolverType === "mood") {
    return songMatchesMoodAliases(song, world.moodAliases || [world.title]);
  }

  return songMatchesCategoryWorld(song, world);
}

export function filterSongsForLaunchWorld<T extends MatchableSong>(
  songs: T[],
  world: LaunchEmotionalWorld
) {
  return songs.filter((song) => songMatchesLaunchWorld(song, world));
}

export function getLaunchWorldEmptyCopy(title: string) {
  const world = getLaunchWorldByTitle(title);

  if (!world) {
    return {
      emptyTitle: "This Hidden Tunes room is warming up",
      emptyMessage:
        "Try another emotional world, genre hub, or search while more tracks arrive in your catalog.",
    };
  }

  return {
    emptyTitle: world.emptyTitle,
    emptyMessage: world.emptyMessage,
  };
}

export function getLaunchWorldCatalogParams(world: LaunchEmotionalWorld) {
  if (world.resolverType === "genre" && world.genreTitles?.[0]) {
    return {
      type: "genre" as const,
      id: world.id,
      title: world.title,
      query: world.genreTitles[0],
    };
  }

  if (world.resolverType === "mood") {
    return {
      type: "mood" as const,
      id: world.id,
      title: world.title,
      query: world.searchQuery,
    };
  }

  return {
    type: "category" as const,
    id: world.id,
    title: world.title,
    query: world.searchQuery,
  };
}

export const EMOTIONAL_DISCOVERY_SHORTCUTS = LAUNCH_EMOTIONAL_WORLDS.map((world) => ({
  id: world.id,
  title: world.title,
  query: world.searchQuery,
  icon: world.icon,
}));
