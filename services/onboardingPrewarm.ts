import { InteractionManager } from "react-native";

import { FALLBACK_ARTWORK, getArtworkUri } from "../utils/artwork";
import { rankCatalogSongs } from "../utils/catalogSongRanking";
import { preloadImages } from "../utils/imagePreloader";
import { setCachedSearchResults } from "../utils/searchQueryCache";
import type { OnboardingPreferences } from "./onboardingPreferences";
import {
  getHiddenTunesSongsPage,
  searchHiddenTunesSongsPage,
  seedOnboardingCatalogPrewarm,
  type HiddenTunesNormalizedSong,
} from "./hiddenTunesApi";

const PREWARM_DEBOUNCE_MS = 450;
const PREWARM_MAX_SONGS = 28;
const PREWARM_MAX_ARTWORK = 5;
const PREWARM_FETCH_TIMEOUT_MS = 4500;

let prewarmDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let prewarmGeneration = 0;
let lastPrewarmFingerprint = "";

function buildFingerprint(preferences: OnboardingPreferences) {
  return JSON.stringify({
    genres: preferences.preferredGenres,
    moods: preferences.preferredMoods,
    energy: preferences.preferredEnergy,
    discovery: preferences.discoveryStyle,
    role: preferences.userRole,
  });
}

function mergeUniqueSongs(
  lists: HiddenTunesNormalizedSong[][]
): HiddenTunesNormalizedSong[] {
  const seen = new Set<string>();
  const merged: HiddenTunesNormalizedSong[] = [];

  for (const list of lists) {
    for (const song of list) {
      const id = String(song.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(song);
      if (merged.length >= PREWARM_MAX_SONGS) {
        return merged;
      }
    }
  }

  return merged;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  }
}

async function fetchGenreSlice(genre: string) {
  const page = await withTimeout(
    searchHiddenTunesSongsPage(genre, 1, 12),
    PREWARM_FETCH_TIMEOUT_MS
  );
  return page?.songs || [];
}

async function fetchMoodSlice(mood: string) {
  const query = `${mood} music`;
  const page = await withTimeout(
    searchHiddenTunesSongsPage(query, 1, 10),
    PREWARM_FETCH_TIMEOUT_MS
  );
  return page?.songs || [];
}

async function fetchRecentSlice() {
  const page = await withTimeout(
    getHiddenTunesSongsPage({ page: 1, limit: 12 }),
    PREWARM_FETCH_TIMEOUT_MS
  );
  return page?.songs || [];
}

function toCachedSearchRows(songs: HiddenTunesNormalizedSong[]) {
  return songs.map((song) => ({
    ...song,
    source: "hidden-tunes",
    sourceName: "Hidden Tunes",
    type: "r2",
  }));
}

async function warmSearchCaches(
  preferences: OnboardingPreferences,
  songs: HiddenTunesNormalizedSong[]
) {
  const firstGenre = preferences.preferredGenres[0];
  const firstMood = preferences.preferredMoods[0];

  if (firstGenre && songs.length > 0) {
    const ranked = rankCatalogSongs(songs, firstGenre, PREWARM_MAX_SONGS);
    const rows = toCachedSearchRows(ranked.map((hit) => hit.song));
    if (rows.length > 0) {
      await setCachedSearchResults(firstGenre, "hidden", rows);
      await setCachedSearchResults(firstGenre, "all", rows);
    }
  }

  if (firstMood && songs.length > 0) {
    const ranked = rankCatalogSongs(songs, firstMood, PREWARM_MAX_SONGS);
    const rows = toCachedSearchRows(ranked.map((hit) => hit.song));
    if (rows.length > 0) {
      await setCachedSearchResults(`${firstMood} music`, "hidden", rows);
      await setCachedSearchResults(firstMood, "all", rows);
    }
  }
}

export function scheduleOnboardingPrewarm(preferences: OnboardingPreferences) {
  if (preferences.userRole !== "listener") {
    return;
  }

  const fingerprint = buildFingerprint(preferences);
  if (fingerprint === lastPrewarmFingerprint) {
    return;
  }

  if (prewarmDebounceTimer) {
    clearTimeout(prewarmDebounceTimer);
  }

  prewarmDebounceTimer = setTimeout(() => {
    prewarmDebounceTimer = null;
    void runOnboardingPrewarm(preferences);
  }, PREWARM_DEBOUNCE_MS);
}

export async function runOnboardingPrewarm(
  preferences: OnboardingPreferences
) {
  if (preferences.userRole !== "listener") {
    if (__DEV__) console.warn("[onboarding] prewarm skipped", "non_listener");
    return;
  }

  const fingerprint = buildFingerprint(preferences);
  if (fingerprint === lastPrewarmFingerprint) {
    if (__DEV__) console.warn("[onboarding] prewarm skipped", "unchanged");
    return;
  }

  const generation = ++prewarmGeneration;
  if (__DEV__) console.log("[onboarding] prewarm start", preferences);

  try {
    const chunks: HiddenTunesNormalizedSong[][] = [];
    const firstGenre = preferences.preferredGenres[0];
    const firstMood = preferences.preferredMoods[0];

    if (firstGenre) {
      chunks.push(await fetchGenreSlice(firstGenre));
    }

    if (firstMood) {
      chunks.push(await fetchMoodSlice(firstMood));
    }

    let merged = mergeUniqueSongs(chunks);

    if (merged.length < 8) {
      merged = mergeUniqueSongs([merged, await fetchRecentSlice()]);
    }

    if (generation !== prewarmGeneration) {
      return;
    }

    if (!merged.length) {
      if (__DEV__) console.warn("[onboarding] prewarm skipped", "no_songs");
      return;
    }

    const seededCount = await seedOnboardingCatalogPrewarm(merged);

    if (generation !== prewarmGeneration) {
      return;
    }

    await warmSearchCaches(preferences, merged);

    if (generation !== prewarmGeneration) {
      return;
    }

    const artworkUrls = merged
      .slice(0, PREWARM_MAX_ARTWORK)
      .map((song) => getArtworkUri(song, FALLBACK_ARTWORK));

    InteractionManager.runAfterInteractions(() => {
      void preloadImages(artworkUrls);
    });

    lastPrewarmFingerprint = fingerprint;
    if (__DEV__) console.log("[onboarding] prewarm ready", seededCount || merged.length);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "prewarm_failed";
    if (__DEV__) console.warn("[onboarding] prewarm skipped", reason);
  }
}
