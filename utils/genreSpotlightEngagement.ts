/**
 * Lightweight local engagement for Genre Spotlights.
 * Writes only on explicit genre/mood opens — never per render.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "hidden_tunes_genre_spotlight_engagement_v1";
const MAX_OPENED = 24;
const MAX_MOOD = 16;

export type GenreSpotlightEngagement = {
  openedGenres: Array<{ genre: string; openedAt: number }>;
  moodEngagementGenres: Array<{ genre: string; weight: number; updatedAt: number }>;
};

let memory: GenreSpotlightEngagement = {
  openedGenres: [],
  moodEngagementGenres: [],
};
let hydrated = false;
let hydratePromise: Promise<GenreSpotlightEngagement> | null = null;
let lastPersistedJson = "";

function normalizeGenre(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sanitize(raw: unknown): GenreSpotlightEngagement {
  const record = raw && typeof raw === "object" ? (raw as GenreSpotlightEngagement) : null;
  const opened = Array.isArray(record?.openedGenres)
    ? record!.openedGenres
        .map((item) => ({
          genre: normalizeGenre(item?.genre),
          openedAt: Number(item?.openedAt) || 0,
        }))
        .filter((item) => item.genre && item.openedAt > 0)
        .slice(0, MAX_OPENED)
    : [];
  const mood = Array.isArray(record?.moodEngagementGenres)
    ? record!.moodEngagementGenres
        .map((item) => ({
          genre: normalizeGenre(item?.genre),
          weight: Math.min(3, Math.max(0.2, Number(item?.weight) || 0.2)),
          updatedAt: Number(item?.updatedAt) || 0,
        }))
        .filter((item) => item.genre)
        .slice(0, MAX_MOOD)
    : [];
  return { openedGenres: opened, moodEngagementGenres: mood };
}

async function persist(next: GenreSpotlightEngagement) {
  memory = next;
  const json = JSON.stringify(next);
  if (json === lastPersistedJson) return;
  lastPersistedJson = json;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Non-fatal — ranking still works from memory.
  }
}

export async function hydrateGenreSpotlightEngagement() {
  if (hydrated) return memory;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      memory = sanitize(raw ? JSON.parse(raw) : null);
      lastPersistedJson = JSON.stringify(memory);
    } catch {
      memory = { openedGenres: [], moodEngagementGenres: [] };
      lastPersistedJson = "";
    }
    hydrated = true;
    return memory;
  })();

  try {
    return await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export function getGenreSpotlightEngagementSnapshot() {
  return memory;
}

export async function recordGenreSpotlightOpen(genreTitle: string) {
  const genre = normalizeGenre(genreTitle);
  if (!genre) return memory;

  await hydrateGenreSpotlightEngagement();
  const openedAt = Date.now();
  const openedGenres = [
    { genre, openedAt },
    ...memory.openedGenres.filter((item) => item.genre !== genre),
  ].slice(0, MAX_OPENED);

  await persist({ ...memory, openedGenres });
  return memory;
}

export async function recordMoodRoomGenreEngagement(genres: string[]) {
  const cleaned = Array.from(
    new Set(genres.map(normalizeGenre).filter(Boolean))
  ).slice(0, 6);
  if (!cleaned.length) return memory;

  await hydrateGenreSpotlightEngagement();
  const updatedAt = Date.now();
  const map = new Map(
    memory.moodEngagementGenres.map((item) => [item.genre, item])
  );

  for (const genre of cleaned) {
    const existing = map.get(genre);
    map.set(genre, {
      genre,
      weight: Math.min(3, (existing?.weight || 0) + 0.5),
      updatedAt,
    });
  }

  const moodEngagementGenres = Array.from(map.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_MOOD);

  await persist({ ...memory, moodEngagementGenres });
  return memory;
}
