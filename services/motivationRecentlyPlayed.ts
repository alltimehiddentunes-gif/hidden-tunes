import AsyncStorage from "@react-native-async-storage/async-storage";

import type { MotivationItem } from "@/types/motivation";

const RECENT_KEY = "hidden_tunes_motivation_recent_v1";
const MAX_RECENT = 20;

export type MotivationRecentEntry = {
  item: MotivationItem;
  playedAt: number;
};

async function readRecent(): Promise<MotivationRecentEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MotivationRecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function recordMotivationRecentlyPlayed(item: MotivationItem) {
  const existing = await readRecent();
  const next = [
    { item, playedAt: Date.now() },
    ...existing.filter((entry) => entry.item.id !== item.id),
  ].slice(0, MAX_RECENT);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export async function listMotivationRecentlyPlayed(limit = 10) {
  const recent = await readRecent();
  return recent.slice(0, limit);
}
