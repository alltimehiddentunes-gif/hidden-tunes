import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TVChannel } from "@/types/tv";

const TV_FAVORITES_KEY = "hidden_tunes_tv_favorites_v1";
const TV_FAVORITES_STORAGE_VERSION = 1;

export type TvFavoriteEntry = {
  channelId: string;
  name: string;
  logoUrl?: string;
  category: TVChannel["category"];
  country?: string;
  savedAt: string;
};

export type TvFavoriteToggleResult = {
  favorited: boolean;
  favorites: TvFavoriteEntry[];
  persisted: boolean;
};

let favoritesMemory: TvFavoriteEntry[] | null = null;
const inFlightToggles = new Set<string>();
const favoriteListeners = new Set<(entries: TvFavoriteEntry[]) => void>();

function normalizeFavorite(raw: unknown): TvFavoriteEntry | null {
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const channelId = String(row.channelId || "").trim();
  const name = String(row.name || "").trim();
  const category = String(row.category || "").trim();
  const savedAt = String(row.savedAt || "").trim();

  if (!channelId || !name || !category || !savedAt) return null;

  return {
    channelId,
    name,
    logoUrl: row.logoUrl ? String(row.logoUrl) : undefined,
    category: category as TvFavoriteEntry["category"],
    country: row.country ? String(row.country) : undefined,
    savedAt,
  };
}

function notifyFavoriteListeners() {
  const snapshot = favoritesMemory || [];
  for (const listener of favoriteListeners) {
    try {
      listener(snapshot);
    } catch {
      // Listener errors must not break favorites.
    }
  }
}

async function persistFavorites(entries: TvFavoriteEntry[]) {
  favoritesMemory = entries;
  notifyFavoriteListeners();

  try {
    await AsyncStorage.setItem(TV_FAVORITES_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export function subscribeTvFavorites(
  listener: (entries: TvFavoriteEntry[]) => void
) {
  favoriteListeners.add(listener);
  return () => {
    favoriteListeners.delete(listener);
  };
}

export async function loadTvFavorites() {
  if (favoritesMemory) return favoritesMemory;

  try {
    const raw = await AsyncStorage.getItem(TV_FAVORITES_KEY);
    if (!raw) {
      favoritesMemory = [];
      return favoritesMemory;
    }

    const parsed = JSON.parse(raw) as unknown[];
    favoritesMemory = (Array.isArray(parsed) ? parsed : [])
      .map(normalizeFavorite)
      .filter((entry): entry is TvFavoriteEntry => entry !== null);

    return favoritesMemory;
  } catch {
    favoritesMemory = [];
    return favoritesMemory;
  }
}

export async function isTvChannelFavorite(channelId: string) {
  const favorites = await loadTvFavorites();
  return favorites.some((entry) => entry.channelId === channelId);
}

export async function toggleTvChannelFavorite(
  channel: TVChannel
): Promise<TvFavoriteToggleResult> {
  const channelId = String(channel.id || "").trim();
  if (!channelId) {
    const favorites = await loadTvFavorites();
    return { favorited: false, favorites, persisted: true };
  }

  // Deduplicate rapid taps — ignore while a toggle for this channel is in flight.
  if (inFlightToggles.has(channelId)) {
    const favorites = await loadTvFavorites();
    return {
      favorited: favorites.some((entry) => entry.channelId === channelId),
      favorites,
      persisted: true,
    };
  }

  inFlightToggles.add(channelId);

  try {
    const favorites = await loadTvFavorites();
    const exists = favorites.some((entry) => entry.channelId === channelId);
    const previous = favorites;

    const next = exists
      ? favorites.filter((entry) => entry.channelId !== channelId)
      : [
          {
            channelId,
            name: channel.name,
            logoUrl: channel.logoUrl,
            category: channel.category,
            country: channel.country,
            savedAt: new Date().toISOString(),
          },
          ...favorites.filter((entry) => entry.channelId !== channelId),
        ];

    // Optimistic memory update for immediate UI.
    favoritesMemory = next;
    notifyFavoriteListeners();

    const persisted = await persistFavorites(next);

    if (!persisted) {
      favoritesMemory = previous;
      notifyFavoriteListeners();
      return {
        favorited: exists,
        favorites: previous,
        persisted: false,
      };
    }

    return {
      favorited: !exists,
      favorites: next,
      persisted: true,
    };
  } finally {
    inFlightToggles.delete(channelId);
  }
}

export function readTvFavoritesSync() {
  return favoritesMemory || [];
}

export function getTvFavoritesStorageVersion() {
  return TV_FAVORITES_STORAGE_VERSION;
}
