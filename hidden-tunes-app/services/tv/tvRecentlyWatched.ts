import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TVChannel, TvRecentlyWatchedEntry } from "@/types/tv";

const TV_RECENTLY_WATCHED_KEY = "hidden_tunes_tv_recently_watched_v1";
const TV_HISTORY_STORAGE_VERSION = 1;
const MAX_RECENT_ENTRIES = 100;

let recentMemory: TvRecentlyWatchedEntry[] | null = null;

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

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
    positionSeconds: optionalNumber(row.positionSeconds),
    durationSeconds: optionalNumber(row.durationSeconds),
    completed: optionalBoolean(row.completed),
    isLive: optionalBoolean(row.isLive),
  };
}

async function persistRecent(entries: TvRecentlyWatchedEntry[]) {
  recentMemory = entries;

  try {
    await AsyncStorage.setItem(TV_RECENTLY_WATCHED_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
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
  const current = await loadTvRecentlyWatched();
  const previous = current.find((item) => item.channelId === channel.id);

  const entry: TvRecentlyWatchedEntry = {
    channelId: channel.id,
    name: channel.name,
    logoUrl: channel.logoUrl,
    category: channel.category,
    country: channel.country,
    watchedAt: new Date().toISOString(),
    isLive: channel.isLive,
    // Preserve any prior VOD progress fields when reopening live metadata-only.
    positionSeconds: channel.isLive ? undefined : previous?.positionSeconds,
    durationSeconds: channel.isLive ? undefined : previous?.durationSeconds,
    completed: channel.isLive ? undefined : previous?.completed,
  };

  const next = [
    entry,
    ...current.filter((item) => item.channelId !== channel.id),
  ].slice(0, MAX_RECENT_ENTRIES);

  await persistRecent(next);
  return next;
}

export async function removeTvRecentlyWatched(channelId: string) {
  const id = String(channelId || "").trim();
  const current = await loadTvRecentlyWatched();
  if (!id) return current;

  const next = current.filter((item) => item.channelId !== id);
  await persistRecent(next);
  return next;
}

export async function clearTvRecentlyWatched() {
  await persistRecent([]);
  return [] as TvRecentlyWatchedEntry[];
}

/**
 * Optional VOD progress writer. Safe to call when position events exist.
 * Live channels ignore position updates.
 */
export async function updateTvWatchProgress(
  channel: Pick<TVChannel, "id" | "name" | "logoUrl" | "category" | "country" | "isLive">,
  progress: {
    positionSeconds: number;
    durationSeconds?: number;
  }
) {
  if (channel.isLive) {
    return loadTvRecentlyWatched();
  }

  const positionSeconds = Math.max(0, progress.positionSeconds);
  const durationSeconds = optionalNumber(progress.durationSeconds);
  const completed =
    typeof durationSeconds === "number" &&
    durationSeconds > 0 &&
    positionSeconds / durationSeconds >= 0.9;

  const current = await loadTvRecentlyWatched();
  const previous = current.find((item) => item.channelId === channel.id);

  const entry: TvRecentlyWatchedEntry = {
    channelId: channel.id,
    name: channel.name,
    logoUrl: channel.logoUrl || previous?.logoUrl,
    category: channel.category,
    country: channel.country || previous?.country,
    watchedAt: new Date().toISOString(),
    isLive: false,
    positionSeconds: completed ? 0 : positionSeconds,
    durationSeconds: durationSeconds ?? previous?.durationSeconds,
    completed: completed || undefined,
  };

  const next = [
    entry,
    ...current.filter((item) => item.channelId !== channel.id),
  ].slice(0, MAX_RECENT_ENTRIES);

  await persistRecent(next);
  return next;
}

export function getContinueWatchingEntries(
  entries: TvRecentlyWatchedEntry[] = recentMemory || []
) {
  return entries.filter((entry) => {
    if (entry.isLive === true) return false;
    if (entry.completed) return false;
    const position = entry.positionSeconds;
    const duration = entry.durationSeconds;
    if (typeof position !== "number" || position <= 0) return false;
    if (typeof duration === "number" && duration > 0 && position / duration >= 0.9) {
      return false;
    }
    return true;
  });
}

export function readTvRecentlyWatchedSync() {
  return recentMemory || [];
}

export function getTvHistoryStorageVersion() {
  return TV_HISTORY_STORAGE_VERSION;
}

export function getTvHistoryMaxEntries() {
  return MAX_RECENT_ENTRIES;
}
