import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TVChannel, TvRecentlyWatchedEntry } from "@/types/tv";

const TV_RECENTLY_WATCHED_KEY = "hidden_tunes_tv_recently_watched_v1";
const MAX_RECENT_ENTRIES = 24;

let recentMemory: TvRecentlyWatchedEntry[] | null = null;

function normalizeEntry(raw: unknown): TvRecentlyWatchedEntry | null {
  if (!raw || typeof raw !== "object") return null;

  const row = raw as Record<string, unknown>;
  const channelId = String(row.channelId || "").trim();
  const name = String(row.name || "").trim();
  const category = String(row.category || "").trim();
  const watchedAt = String(row.watchedAt || "").trim();

  if (!channelId || !name || !category || !watchedAt) return null;

  return {
    channelId,
    name,
    logoUrl: row.logoUrl ? String(row.logoUrl) : undefined,
    category: category as TvRecentlyWatchedEntry["category"],
    country: row.country ? String(row.country) : undefined,
    watchedAt,
  };
}

export async function loadTvRecentlyWatched() {
  if (recentMemory) return recentMemory;

  try {
    const raw = await AsyncStorage.getItem(TV_RECENTLY_WATCHED_KEY);
    if (!raw) {
      recentMemory = [];
      return recentMemory;
    }

    const parsed = JSON.parse(raw) as unknown[];
    recentMemory = (Array.isArray(parsed) ? parsed : [])
      .map(normalizeEntry)
      .filter((entry): entry is TvRecentlyWatchedEntry => entry !== null)
      .slice(0, MAX_RECENT_ENTRIES);

    return recentMemory;
  } catch {
    recentMemory = [];
    return recentMemory;
  }
}

export async function recordTvRecentlyWatched(channel: TVChannel) {
  const entry: TvRecentlyWatchedEntry = {
    channelId: channel.id,
    name: channel.name,
    logoUrl: channel.logoUrl,
    category: channel.category,
    country: channel.country,
    watchedAt: new Date().toISOString(),
  };

  const current = await loadTvRecentlyWatched();
  const next = [
    entry,
    ...current.filter((item) => item.channelId !== channel.id),
  ].slice(0, MAX_RECENT_ENTRIES);

  recentMemory = next;

  try {
    await AsyncStorage.setItem(TV_RECENTLY_WATCHED_KEY, JSON.stringify(next));
  } catch {}

  return next;
}

export function readTvRecentlyWatchedSync() {
  return recentMemory || [];
}
