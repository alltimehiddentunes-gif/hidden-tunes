import AsyncStorage from "@react-native-async-storage/async-storage";

const PROGRESS_KEY = "hidden_tunes_motivation_progress_v1";
const MAX_ENTRIES = 48;

export type MotivationProgressEntry = {
  itemId: string;
  programId?: string | null;
  programTitle?: string | null;
  programArtwork?: string | null;
  categorySlug?: string | null;
  itemTitle?: string | null;
  positionMillis: number;
  durationMillis?: number | null;
  completionPercentage?: number;
  completed?: boolean;
  updatedAt: number;
};

type Store = Record<string, MotivationProgressEntry>;

async function readStore(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
}

export async function saveMotivationProgress(entry: MotivationProgressEntry) {
  const itemId = String(entry.itemId || "").trim();
  if (!itemId) return null;
  const store = await readStore();
  store[itemId] = {
    ...entry,
    itemId,
    updatedAt: Math.max(entry.updatedAt || Date.now(), Date.now()),
  };
  const sorted = Object.values(store).sort((a, b) => b.updatedAt - a.updatedAt);
  const trimmed = sorted.slice(0, MAX_ENTRIES).reduce<Store>((acc, row) => {
    acc[row.itemId] = row;
    return acc;
  }, {});
  await writeStore(trimmed);
  return store[itemId];
}

export async function loadMotivationProgress(itemId: string) {
  const store = await readStore();
  return store[String(itemId || "").trim()] || null;
}

export async function listContinueMotivationEntries(limit = 10) {
  const store = await readStore();
  return Object.values(store)
    .filter((entry) => !entry.completed && entry.positionMillis > 3000)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
