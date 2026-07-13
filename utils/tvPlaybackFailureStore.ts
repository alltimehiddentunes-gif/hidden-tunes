import AsyncStorage from "@react-native-async-storage/async-storage";

const TV_PLAYBACK_FAILURES_KEY = "hidden_tunes_tv_playback_failures_v1";
const LOCAL_QUARANTINE_THRESHOLD = 3;

type FailureRecord = {
  count: number;
  lastAt: string;
};

let memoryCache: Record<string, FailureRecord> | null = null;

async function loadRecords() {
  if (memoryCache) return memoryCache;

  try {
    const raw = await AsyncStorage.getItem(TV_PLAYBACK_FAILURES_KEY);
    if (!raw) {
      memoryCache = {};
      return memoryCache;
    }

    const parsed = JSON.parse(raw) as Record<string, FailureRecord>;
    memoryCache = parsed && typeof parsed === "object" ? parsed : {};
    return memoryCache;
  } catch {
    memoryCache = {};
    return memoryCache;
  }
}

async function persistRecords(records: Record<string, FailureRecord>) {
  memoryCache = records;
  try {
    await AsyncStorage.setItem(TV_PLAYBACK_FAILURES_KEY, JSON.stringify(records));
  } catch {
    // non-fatal
  }
}

export async function recordTvPlaybackFailure(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id) return 0;

  const records = await loadRecords();
  const current = records[id]?.count ?? 0;
  const next = current + 1;

  records[id] = {
    count: next,
    lastAt: new Date().toISOString(),
  };

  await persistRecords(records);
  return next;
}

export async function clearTvPlaybackFailure(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id) return;

  const records = await loadRecords();
  if (!records[id]) return;

  delete records[id];
  await persistRecords(records);
}

export async function getTvPlaybackFailureCount(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id) return 0;

  const records = await loadRecords();
  return records[id]?.count ?? 0;
}

export function isTvChannelLocallyQuarantined(channelId: string) {
  const id = String(channelId || "").trim();
  if (!id || !memoryCache) return false;

  return (memoryCache[id]?.count ?? 0) >= LOCAL_QUARANTINE_THRESHOLD;
}

export async function warmTvPlaybackFailureStore() {
  await loadRecords();
}
