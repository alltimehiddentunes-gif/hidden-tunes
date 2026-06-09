import AsyncStorage from "@react-native-async-storage/async-storage";

import { ONBOARDING_STORAGE_KEYS } from "../services/onboardingPreferences";

let cachedPreferredGenres: string[] = [];

export async function hydrateDiscoveryPreferredGenres() {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEYS.preferredGenres);
    const parsed = raw ? JSON.parse(raw) : [];
    cachedPreferredGenres = Array.isArray(parsed)
      ? parsed.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
  } catch {
    cachedPreferredGenres = [];
  }
  return cachedPreferredGenres;
}

export function getDiscoveryPreferredGenres() {
  return cachedPreferredGenres;
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
