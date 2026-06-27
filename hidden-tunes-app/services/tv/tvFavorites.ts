import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TVChannel } from "@/types/tv";

const TV_FAVORITES_KEY = "hidden_tunes_tv_favorites_v1";

export type TvFavoriteEntry = {
  channelId: string;
  name: string;
  logoUrl?: string;
  category: TVChannel["category"];
  country?: string;
  savedAt: string;
};

let favoritesMemory: TvFavoriteEntry[] | null = null;

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

async function persistFavorites(entries: TvFavoriteEntry[]) {
  favoritesMemory = entries;

  try {
    await AsyncStorage.setItem(TV_FAVORITES_KEY, JSON.stringify(entries));
  } catch {}
}

export async function isTvChannelFavorite(channelId: string) {
  const favorites = await loadTvFavorites();
  return favorites.some((entry) => entry.channelId === channelId);
}

export async function toggleTvChannelFavorite(channel: TVChannel) {
  const favorites = await loadTvFavorites();
  const exists = favorites.some((entry) => entry.channelId === channel.id);

  if (exists) {
    const next = favorites.filter((entry) => entry.channelId !== channel.id);
    await persistFavorites(next);
    return { favorited: false, favorites: next };
  }

  const next = [
    {
      channelId: channel.id,
      name: channel.name,
      logoUrl: channel.logoUrl,
      category: channel.category,
      country: channel.country,
      savedAt: new Date().toISOString(),
    },
    ...favorites,
  ];

  await persistFavorites(next);
  return { favorited: true, favorites: next };
}

export function readTvFavoritesSync() {
  return favoritesMemory || [];
}
