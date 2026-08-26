import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TVChannel, TvRecentlyWatchedEntry } from "@/types/tv";

const TV_RECENTLY_WATCHED_KEY = "hidden_tunes_tv_recently_watched_v1";
const TV_HISTORY_STORAGE_VERSION = 1;
const MAX_RECENT_ENTRIES = 20;

let recentMemory: TvRecentlyWatchedEntry[] | null = null;
let recentLoadPromise: Promise<TvRecentlyWatchedEntry[]> | null = null;
const listeners = new Set<(entries: TvRecentlyWatchedEntry[]) => void>();
const pendingChannels = new Map<string, boolean | undefined>();

function normalizeChannelId(value: unknown) {
  return String(value ?? "").trim();
}

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
  const channelId = normalizeChannelId(row.channelId);
  const name = String(row.name || "").trim();
  const category = String(row.category || "").trim();
  const watchedAt = String(row.watchedAt || row.lastWatchedAt || "").trim();

  if (!channelId || !watchedAt) return null;

  return {
    channelId,
    // Legacy metadata remains readable, but rendering resolves against the
    // current catalog by channelId rather than trusting persisted card data.
    name: name || channelId,
    logoUrl: row.logoUrl ? String(row.logoUrl) : undefined,
    category: (category || "local") as TvRecentlyWatchedEntry["category"],
    country: row.country ? String(row.country) : undefined,
    watchedAt,
    positionSeconds: optionalNumber(row.positionSeconds),
    durationSeconds: optionalNumber(row.durationSeconds),
    completed: optionalBoolean(row.completed),
    isLive: optionalBoolean(row.isLive),
  };
}

function toPersistedEntry(entry: TvRecentlyWatchedEntry) {
  return {
    channelId: normalizeChannelId(entry.channelId),
    watchedAt: entry.watchedAt,
    ...(typeof entry.positionSeconds === "number"
      ? { positionSeconds: entry.positionSeconds }
      : {}),
    ...(typeof entry.durationSeconds === "number"
      ? { durationSeconds: entry.durationSeconds }
      : {}),
    ...(entry.completed === true ? { completed: true } : {}),
    ...(entry.isLive === false ? { isLive: false } : {}),
  };
}

async function persistRecent(entries: TvRecentlyWatchedEntry[]) {
  recentMemory = entries;
  listeners.forEach((listener) => listener(entries));

  try {
    await AsyncStorage.setItem(
      TV_RECENTLY_WATCHED_KEY,
      JSON.stringify(entries.map(toPersistedEntry))
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadTvRecentlyWatched() {
  if (recentMemory) return recentMemory;
  if (recentLoadPromise) return recentLoadPromise;

  recentLoadPromise = (async () => {
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
  })();

  try {
    return await recentLoadPromise;
  } finally {
    recentLoadPromise = null;
  }
}

export async function recordTvRecentlyWatched(channel: TVChannel | string) {
  const channelId = normalizeChannelId(
    typeof channel === "string" ? channel : channel.id
  );
  if (channelId) {
    const isLive = typeof channel === "string" ? undefined : channel.isLive;
    if (isLive !== undefined || !pendingChannels.has(channelId)) {
      pendingChannels.set(channelId, isLive);
    }
  }
  return loadTvRecentlyWatched();
}

export async function confirmTvRecentlyWatched(channelId: string) {
  const normalizedChannelId = normalizeChannelId(channelId);
  if (!normalizedChannelId || !pendingChannels.has(normalizedChannelId)) {
    return loadTvRecentlyWatched();
  }
  const pendingIsLive = pendingChannels.get(normalizedChannelId);
  pendingChannels.delete(normalizedChannelId);
  const current = await loadTvRecentlyWatched();
  const previous = current.find((item) => item.channelId === normalizedChannelId);
  const isLive = pendingIsLive ?? previous?.isLive ?? true;

  const entry: TvRecentlyWatchedEntry = {
    channelId: normalizedChannelId,
    name: previous?.name || normalizedChannelId,
    logoUrl: previous?.logoUrl,
    category: previous?.category || "local",
    country: previous?.country,
    watchedAt: new Date().toISOString(),
    isLive,
    // Preserve any prior VOD progress fields when reopening live metadata-only.
    positionSeconds: isLive ? undefined : previous?.positionSeconds,
    durationSeconds: isLive ? undefined : previous?.durationSeconds,
    completed: isLive ? undefined : previous?.completed,
  };

  const next = [
    entry,
    ...current.filter((item) => item.channelId !== normalizedChannelId),
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

export function cancelPendingTvRecentlyWatched(channelId: string) {
  pendingChannels.delete(normalizeChannelId(channelId));
}

export function subscribeTvRecentlyWatched(
  listener: (entries: TvRecentlyWatchedEntry[]) => void
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTvHistoryStorageVersion() {
  return TV_HISTORY_STORAGE_VERSION;
}

export function getTvHistoryMaxEntries() {
  return MAX_RECENT_ENTRIES;
}
