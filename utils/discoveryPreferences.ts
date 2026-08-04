import AsyncStorage from "@react-native-async-storage/async-storage";

import { ONBOARDING_STORAGE_KEYS } from "../services/onboardingPreferences";

let cachedPreferredGenres: string[] = [];
let cachedPreferredMoods: string[] = [];
let cachedDiscoveryStyle = "balanced";

export async function hydrateDiscoveryPreferredGenres() {
  try {
    const entries = await AsyncStorage.multiGet([
      ONBOARDING_STORAGE_KEYS.preferredGenres,
      ONBOARDING_STORAGE_KEYS.preferredMoods,
      ONBOARDING_STORAGE_KEYS.discoveryStyle,
    ]);
    const parsed = entries[0][1] ? JSON.parse(entries[0][1] as string) : [];
    cachedPreferredGenres = Array.isArray(parsed)
      ? parsed.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const parsedMoods = entries[1][1] ? JSON.parse(entries[1][1] as string) : [];
    cachedPreferredMoods = Array.isArray(parsedMoods)
      ? parsedMoods.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    cachedDiscoveryStyle = ["familiar", "balanced", "adventurous"].includes(
      String(entries[2][1] || "")
    )
      ? String(entries[2][1])
      : "balanced";
  } catch {
    cachedPreferredGenres = [];
    cachedPreferredMoods = [];
    cachedDiscoveryStyle = "balanced";
  }
  return cachedPreferredGenres;
}

export function getDiscoveryPreferredGenres() {
  return cachedPreferredGenres;
}

export function getDiscoveryPreferenceSnapshot() {
  return {
    genres: [...cachedPreferredGenres],
    moods: [...cachedPreferredMoods],
    discoveryStyle: cachedDiscoveryStyle,
  };
}

export function sortItemsByPreferredGenres<T extends { title?: string; name?: string }>(
  items: T[],
  preferredGenres: string[] = cachedPreferredGenres
) {
  if (!preferredGenres.length) return items;

  const normalizedPreferred = preferredGenres.map((genre) => genre.toLowerCase());

  return [...items].sort((left, right) => {
    const leftLabel = String(left.title || left.name || "").toLowerCase();
    const rightLabel = String(right.title || right.name || "").toLowerCase();

    const leftRank = normalizedPreferred.findIndex(
      (genre) => leftLabel.includes(genre) || genre.includes(leftLabel)
    );
    const rightRank = normalizedPreferred.findIndex(
      (genre) => rightLabel.includes(genre) || genre.includes(rightLabel)
    );

    const safeLeft = leftRank >= 0 ? leftRank : Number.MAX_SAFE_INTEGER;
    const safeRight = rightRank >= 0 ? rightRank : Number.MAX_SAFE_INTEGER;
    if (safeLeft !== safeRight) return safeLeft - safeRight;
    return leftLabel.localeCompare(rightLabel);
  });
}
