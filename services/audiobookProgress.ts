import AsyncStorage from "@react-native-async-storage/async-storage";

const PROGRESS_KEY = "hidden_tunes_audiobook_progress_v1";

export type AudiobookProgressEntry = {
  bookId: string;
  chapterId: string;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  positionMillis: number;
  updatedAt: number;
};

type AudiobookProgressStore = Record<string, AudiobookProgressEntry>;

async function readStore(): Promise<AudiobookProgressStore> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AudiobookProgressStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store: AudiobookProgressStore) {
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(store));
}

export async function loadAudiobookProgress(
  bookId: string
): Promise<AudiobookProgressEntry | null> {
  const cleanBookId = String(bookId || "").trim();
  if (!cleanBookId) return null;
  const store = await readStore();
  return store[cleanBookId] || null;
}

export async function saveAudiobookProgress(entry: AudiobookProgressEntry) {
  const cleanBookId = String(entry.bookId || "").trim();
  const cleanChapterId = String(entry.chapterId || "").trim();
  if (!cleanBookId || !cleanChapterId) return null;

  const store = await readStore();
  const next: AudiobookProgressEntry = {
    bookId: cleanBookId,
    chapterId: cleanChapterId,
    chapterNumber: entry.chapterNumber ?? null,
    chapterTitle: entry.chapterTitle ?? null,
    positionMillis: Math.max(0, Math.floor(entry.positionMillis || 0)),
    updatedAt: Date.now(),
  };
  store[cleanBookId] = next;
  await writeStore(store);
  return next;
}

export async function clearAudiobookProgress(bookId: string) {
  const cleanBookId = String(bookId || "").trim();
  if (!cleanBookId) return;
  const store = await readStore();
  if (!store[cleanBookId]) return;
  delete store[cleanBookId];
  await writeStore(store);
}
