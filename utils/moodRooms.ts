import { getArtworkUri } from "./artwork";
import { getMoodTags, normalizeGenreKey } from "./genreAliases";
import { getSongDedupeKey } from "./catalogDedupe";

export type MoodRoomGradient = readonly [string, string, ...string[]];

export type MoodRoomDefinition = {
  id: string;
  title: string;
  subtitle: string;
  aliases: string[];
  gradient: MoodRoomGradient;
};

export type MoodRoomGroup<T> = {
  id: string;
  title: string;
  subtitle: string;
  songs: T[];
  artwork: string[];
  artworkSong?: T;
  preview: string[];
  score: number;
  gradient: MoodRoomGradient;
};

type MoodFieldSong = {
  id?: unknown;
  title?: unknown;
  artist?: unknown;
  genre?: unknown;
  mood?: unknown;
  moodGenre?: unknown;
  tags?: unknown;
  emotion?: unknown;
};

const DEFAULT_GRADIENT: MoodRoomGradient = ["#1A0830", "#0A0612"];

const PREMIUM_MOOD_ROOMS: MoodRoomDefinition[] = [
  {
    id: "late-night",
    title: "Late Night",
    subtitle: "Soft songs for quiet hours",
    aliases: [
      "late night",
      "midnight",
      "midnight soul",
      "late night jazz",
      "night",
      "after hours",
    ],
    gradient: ["#1A1038", "#080612"],
  },
  {
    id: "healing",
    title: "Healing",
    subtitle: "Gentle music for recovery",
    aliases: [
      "healing",
      "healing music",
      "recovery",
      "restorative",
      "spiritual calm",
      "anxiety relief",
    ],
    gradient: ["#0F2A28", "#081418"],
  },
  {
    id: "party-energy",
    title: "Party Energy",
    subtitle: "High-energy songs for movement",
    aliases: [
      "party",
      "party energy",
      "energy",
      "dance",
      "club",
      "movement",
      "sunset drive",
    ],
    gradient: ["#2A1038", "#120818"],
  },
  {
    id: "focus",
    title: "Focus",
    subtitle: "Clean sounds for deep concentration",
    aliases: [
      "focus",
      "focus flow",
      "concentration",
      "study",
      "work",
      "deep work",
    ],
    gradient: ["#101C2E", "#080C14"],
  },
  {
    id: "romantic",
    title: "Romantic",
    subtitle: "Warm songs for connection",
    aliases: [
      "romantic",
      "romance",
      "love",
      "soft intimacy",
      "intimate",
      "warm vintage",
    ],
    gradient: ["#2A1420", "#140810"],
  },
  {
    id: "heartbreak",
    title: "Heartbreak",
    subtitle: "Emotional songs for letting go",
    aliases: [
      "heartbreak",
      "heartbreak soul",
      "breakup",
      "sad",
      "lonely roads",
    ],
    gradient: ["#1E1428", "#0C0810"],
  },
  {
    id: "calm",
    title: "Calm",
    subtitle: "Peaceful music for slowing down",
    aliases: [
      "calm",
      "peaceful",
      "relax",
      "slow burn",
      "rainy night blues",
      "emotional piano",
    ],
    gradient: ["#0F2028", "#081014"],
  },
  {
    id: "nostalgic",
    title: "Nostalgic",
    subtitle: "Songs that feel like memory",
    aliases: [
      "nostalgic",
      "nostalgia",
      "memory",
      "vintage",
      "throwback",
      "retro",
    ],
    gradient: ["#241C14", "#100C08"],
  },
  {
    id: "deep-feelings",
    title: "Deep Feelings",
    subtitle: "Heavy emotion and inner weight",
    aliases: [
      "deep feelings",
      "deep reflection",
      "deep emotional",
      "emotional",
      "cinematic darkness",
      "dark atmosphere",
    ],
    gradient: ["#181028", "#0A0814"],
  },
  {
    id: "hidden-gems",
    title: "Hidden Gems",
    subtitle: "Underrated songs worth finding",
    aliases: [
      "hidden gems",
      "hidden gem",
      "underrated",
      "rare finds",
      "deep cuts",
    ],
    gradient: ["#142028", "#080E14"],
  },
];

export function getPremiumMoodRooms(): MoodRoomDefinition[] {
  return PREMIUM_MOOD_ROOMS.map((room) => ({
    ...room,
    aliases: [...room.aliases],
  }));
}

const HIDDEN_MOOD_KEYS = new Set([
  "",
  "mood unknown",
  "unknown",
  "unknown mood",
  "none",
  "untagged",
]);

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function titleCaseMood(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeMoodKey(value: unknown): string {
  return normalizeGenreKey(value);
}

export function normalizeMoodName(value: unknown): string {
  const cleaned = collapseSpaces(String(value || ""));
  if (!cleaned) return "";

  const key = normalizeMoodKey(cleaned);
  if (HIDDEN_MOOD_KEYS.has(key)) return "";

  const premium = PREMIUM_MOOD_ROOMS.find((room) => moodValueMatchesDefinition(cleaned, room));
  if (premium) return premium.title;

  return titleCaseMood(cleaned);
}

const LAYER3_MOOD_TAG_KEYS = new Set(
  getMoodTags().map((tag) => normalizeMoodKey(tag)).filter(Boolean)
);

function splitMoodFieldValue(value: unknown): string[] {
  const raw = collapseSpaces(String(value || ""));
  if (!raw) return [];

  if (raw.includes(",")) {
    return raw.split(",").map((part) => collapseSpaces(part)).filter(Boolean);
  }

  if (raw.includes("|")) {
    return raw.split("|").map((part) => collapseSpaces(part)).filter(Boolean);
  }

  return [raw];
}

function exactMoodAliasKeys(definition: MoodRoomDefinition): string[] {
  return [definition.title, ...definition.aliases]
    .map((alias) => normalizeMoodKey(alias))
    .filter(Boolean);
}

/**
 * Layer-3 emotional tags are often stored on `genre` (see genreAliases MOOD_TAGS).
 * Only promote genre/tag values that are known mood tags or exact room aliases —
 * never loose substring matches against core genres like "Soul".
 */
function isCatalogMoodAssignmentToken(value: string): boolean {
  const key = normalizeMoodKey(value);
  if (!key || HIDDEN_MOOD_KEYS.has(key)) return false;
  if (LAYER3_MOOD_TAG_KEYS.has(key)) return true;
  return PREMIUM_MOOD_ROOMS.some((room) => exactMoodAliasKeys(room).includes(key));
}

function collectSongMoodTokens(song: MoodFieldSong): string[] {
  const primaryValues = [song.mood, song.moodGenre, song.emotion];
  const assignmentValues = [song.genre, song.tags];
  const tokens: string[] = [];
  const seen = new Set<string>();

  const pushToken = (value: string, requireMoodAssignment: boolean) => {
    if (!value) return;
    if (requireMoodAssignment && !isCatalogMoodAssignmentToken(value)) return;
    const key = normalizeMoodKey(value);
    if (!key || seen.has(key) || HIDDEN_MOOD_KEYS.has(key)) return;
    seen.add(key);
    tokens.push(value);
  };

  primaryValues.forEach((value) => {
    splitMoodFieldValue(value).forEach((part) => pushToken(part, false));
  });

  assignmentValues.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        splitMoodFieldValue(entry).forEach((part) => pushToken(part, true));
      });
      return;
    }
    splitMoodFieldValue(value).forEach((part) => pushToken(part, true));
  });

  return tokens;
}

export function moodValueMatchesDefinition(
  moodValue: unknown,
  definition: MoodRoomDefinition
): boolean {
  const moodKey = normalizeMoodKey(moodValue);
  if (!moodKey || HIDDEN_MOOD_KEYS.has(moodKey)) return false;

  const aliasKeys = definition.aliases.map((alias) => normalizeMoodKey(alias));
  if (aliasKeys.includes(moodKey)) return true;

  const titleKey = normalizeMoodKey(definition.title);
  if (moodKey === titleKey) return true;

  return aliasKeys.some((aliasKey) => {
    if (!aliasKey || aliasKey.length < 4) return moodKey === aliasKey;
    return moodKey.includes(aliasKey) || aliasKey.includes(moodKey);
  });
}

export function songMatchesMoodRoom<T extends MoodFieldSong>(
  song: T,
  definition: MoodRoomDefinition
): boolean {
  return collectSongMoodTokens(song).some((token) =>
    moodValueMatchesDefinition(token, definition)
  );
}

export function songMatchesMoodLabel<T extends MoodFieldSong>(
  song: T,
  label: unknown
): boolean {
  const targetTitle = normalizeMoodName(label);
  if (!targetTitle) return false;

  const premium = PREMIUM_MOOD_ROOMS.find((room) => room.title === targetTitle);
  if (premium) return songMatchesMoodRoom(song, premium);

  return collectSongMoodTokens(song).some(
    (token) => normalizeMoodName(token) === targetTitle
  );
}

function subtitleForCustomMood(title: string): string {
  return `Songs shaped for ${title.toLowerCase()}`;
}

function artworkForSong(song: MoodFieldSong) {
  return getArtworkUri(song, "");
}

/**
 * Groups catalog songs into premium mood rooms with accurate artwork and copy.
 */
export function buildMoodRoomGroups<T extends MoodFieldSong>(
  songs: T[],
  limit = 6
): MoodRoomGroup<T>[] {
  const pool = songs.filter((song) => collectSongMoodTokens(song).length > 0);
  const usedSongKeys = new Set<string>();
  const usedArtworkKeys = new Set<string>();
  const groups: MoodRoomGroup<T>[] = [];

  const takeGroup = (
    definition: MoodRoomDefinition,
    groupSongs: T[],
    minSongs: number
  ) => {
    const uniqueSongs: T[] = [];

    groupSongs.forEach((song) => {
      const key = getSongDedupeKey(song);
      if (!key || usedSongKeys.has(key)) return;
      usedSongKeys.add(key);
      uniqueSongs.push(song);
    });

    if (uniqueSongs.length < minSongs) return;

    let artworkUrl = "";
    let artworkSong: T | undefined;

    for (const song of uniqueSongs) {
      const url = artworkForSong(song);
      if (!url) continue;

      const key = getSongDedupeKey(song);
      if (usedArtworkKeys.has(key)) continue;

      artworkSong = song;
      artworkUrl = url;
      usedArtworkKeys.add(key);
      break;
    }

    if (!artworkUrl) {
      for (const song of uniqueSongs) {
        const url = artworkForSong(song);
        if (!url) continue;
        artworkSong = song;
        artworkUrl = url;
        break;
      }
    }

    groups.push({
      id: `mood-${definition.id}`,
      title: definition.title,
      subtitle: definition.subtitle,
      songs: uniqueSongs.slice(0, 10),
      artwork: artworkUrl ? [artworkUrl] : [],
      artworkSong,
      preview: uniqueSongs
        .slice(0, 3)
        .map((song) => String(song.title || "Hidden Tunes").trim()),
      score: uniqueSongs.length,
      gradient: definition.gradient,
    });
  };

  PREMIUM_MOOD_ROOMS.forEach((definition) => {
    const groupSongs = pool.filter((song) => songMatchesMoodRoom(song, definition));
    takeGroup(definition, groupSongs, 1);
  });

  const customMoods = new Map<string, T[]>();

  pool.forEach((song) => {
    const key = getSongDedupeKey(song);
    if (!key || usedSongKeys.has(key)) return;

    const token = collectSongMoodTokens(song).find((value) => {
      const normalized = normalizeMoodName(value);
      return Boolean(normalized);
    });

    if (!token) return;

    const title = normalizeMoodName(token);
    if (!title) return;

    if (PREMIUM_MOOD_ROOMS.some((room) => songMatchesMoodRoom(song, room))) {
      return;
    }

    const moodKey = normalizeMoodKey(title);
    const current = customMoods.get(moodKey) || [];
    current.push(song);
    customMoods.set(moodKey, current);
  });

  Array.from(customMoods.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([moodKey, groupSongs]) => {
      if (groups.length >= limit) return;

      const title = normalizeMoodName(groupSongs[0]?.mood || moodKey);
      if (!title) return;

      takeGroup(
        {
          id: moodKey.replace(/\s+/g, "-"),
          title,
          subtitle: subtitleForCustomMood(title),
          aliases: [title],
          gradient: DEFAULT_GRADIENT,
        },
        groupSongs,
        2
      );
    });

  return groups.sort((a, b) => b.score - a.score).slice(0, limit);
}
