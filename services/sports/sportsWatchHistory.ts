import AsyncStorage from "@react-native-async-storage/async-storage";

const HISTORY_KEY = "hidden_tunes_sports_watch_history_v1";
const CONTINUE_KEY = "hidden_tunes_sports_continue_watching_v1";
const MAX_ITEMS = 50;

export type SportsWatchHistoryEntry = {
  id: string;
  kind: "broadcast" | "channel" | "video";
  title: string;
  positionMs: number;
  durationMs?: number | null;
  lastWatchedAt: string;
};

async function readList(key: string): Promise<SportsWatchHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, items: SportsWatchHistoryEntry[]) {
  await AsyncStorage.setItem(key, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export async function recordSportsWatchHistory(
  entry: Omit<SportsWatchHistoryEntry, "lastWatchedAt">
) {
  const items = await readList(HISTORY_KEY);
  const next: SportsWatchHistoryEntry = {
    ...entry,
    lastWatchedAt: new Date().toISOString(),
  };
  const filtered = items.filter((i) => !(i.kind === entry.kind && i.id === entry.id));
  filtered.unshift(next);
  await writeList(HISTORY_KEY, filtered);
}

export async function getSportsWatchHistory() {
  return readList(HISTORY_KEY);
}

export async function upsertSportsContinueWatching(
  entry: Omit<SportsWatchHistoryEntry, "lastWatchedAt">
) {
  const items = await readList(CONTINUE_KEY);
  const next: SportsWatchHistoryEntry = {
    ...entry,
    lastWatchedAt: new Date().toISOString(),
  };
  const filtered = items.filter((i) => !(i.kind === entry.kind && i.id === entry.id));
  if ((entry.durationMs || 0) > 0 && entry.positionMs / (entry.durationMs || 1) > 0.95) {
    await writeList(CONTINUE_KEY, filtered);
    return;
  }
  filtered.unshift(next);
  await writeList(CONTINUE_KEY, filtered);
}

export async function getSportsContinueWatching() {
  return readList(CONTINUE_KEY);
}
