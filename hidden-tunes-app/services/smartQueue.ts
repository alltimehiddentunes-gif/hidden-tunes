import AsyncStorage from "@react-native-async-storage/async-storage";

const SMART_QUEUE_KEY = "hidden_tunes_smart_queue_v1";

export type SmartQueueTrack = {
  id: string;
  title: string;
  artist?: string;
  artwork?: string;
  streamUrl?: string;
  url?: string;
  genre?: string;
  mood?: string;
  sourceName?: string;
  type?: string;
  isOnline?: boolean;
};

function getTrackId(track: any) {
  return String(
    track?.id || track?.videoId || `${track?.title}-${track?.artist}`
  )
    .replace("youtube-", "")
    .trim();
}

function normalizeTrack(track: any): SmartQueueTrack {
  return {
    ...track,
    id: getTrackId(track),
    title: track?.title || "Unknown Song",
    artist:
      track?.artist ||
      track?.user?.name ||
      track?.channelTitle ||
      "Hidden Tunes",
    artwork:
      track?.artwork ||
      track?.cover ||
      track?.thumbnail ||
      undefined,
    streamUrl: track?.streamUrl || track?.url,
    url: track?.url || track?.streamUrl,
    genre: track?.genre,
    mood: track?.mood,
    sourceName: track?.sourceName || "Hidden Tunes",
    type: track?.type || "r2",
    isOnline: track?.isOnline ?? true,
  };
}

export async function getSmartQueue(): Promise<SmartQueueTrack[]> {
  try {
    const raw = await AsyncStorage.getItem(SMART_QUEUE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed.map(normalizeTrack);
  } catch (error) {
    if (__DEV__) console.log("Get smart queue error:", error);
    return [];
  }
}

export async function saveSmartQueue(tracks: SmartQueueTrack[]) {
  try {
    const normalized = tracks.map(normalizeTrack);

    await AsyncStorage.setItem(
      SMART_QUEUE_KEY,
      JSON.stringify(normalized)
    );

    return normalized;
  } catch (error) {
    if (__DEV__) console.log("Save smart queue error:", error);
    return [];
  }
}

let pendingSmartQueue: SmartQueueTrack[] | null = null;
let smartQueuePersistTimer: ReturnType<typeof setTimeout> | null = null;
let lastSmartQueueSerialized = "";

const SMART_QUEUE_PERSIST_DEBOUNCE_MS = 900;

async function flushScheduledSmartQueue() {
  smartQueuePersistTimer = null;

  if (!pendingSmartQueue) return;

  const normalized = pendingSmartQueue.map(normalizeTrack);
  pendingSmartQueue = null;

  const serialized = JSON.stringify(normalized);
  if (serialized === lastSmartQueueSerialized) {
    return;
  }

  lastSmartQueueSerialized = serialized;

  try {
    await AsyncStorage.setItem(SMART_QUEUE_KEY, serialized);
  } catch (error) {
    if (__DEV__) console.log("Save smart queue error:", error);
  }
}

export function scheduleSaveSmartQueue(tracks: SmartQueueTrack[]) {
  pendingSmartQueue = tracks;

  if (smartQueuePersistTimer) {
    clearTimeout(smartQueuePersistTimer);
  }

  smartQueuePersistTimer = setTimeout(() => {
    void flushScheduledSmartQueue();
  }, SMART_QUEUE_PERSIST_DEBOUNCE_MS);
}

export async function addToSmartQueue(track: SmartQueueTrack) {
  try {
    const current = await getSmartQueue();

    const normalized = normalizeTrack(track);

    const filtered = current.filter(
      (item) => getTrackId(item) !== getTrackId(normalized)
    );

    const updated = [normalized, ...filtered].slice(0, 200);

    await saveSmartQueue(updated);

    return updated;
  } catch (error) {
    if (__DEV__) console.log("Add smart queue error:", error);
    return [];
  }
}

export async function clearSmartQueue() {
  try {
    await AsyncStorage.removeItem(SMART_QUEUE_KEY);
  } catch (error) {
    if (__DEV__) console.log("Clear smart queue error:", error);
  }
}

export async function getRelatedTracks(
  seedTrack: SmartQueueTrack,
  library: SmartQueueTrack[]
) {
  try {
    const seedGenre = String(seedTrack?.genre || "").toLowerCase();
    const seedMood = String(seedTrack?.mood || "").toLowerCase();
    const seedArtist = String(seedTrack?.artist || "").toLowerCase();

    const filtered = library.filter((track) => {
      if (getTrackId(track) === getTrackId(seedTrack)) {
        return false;
      }

      const genre = String(track?.genre || "").toLowerCase();
      const mood = String(track?.mood || "").toLowerCase();
      const artist = String(track?.artist || "").toLowerCase();

      return (
        genre === seedGenre ||
        mood === seedMood ||
        artist === seedArtist
      );
    });

    return filtered.slice(0, 25);
  } catch (error) {
    if (__DEV__) console.log("Related tracks error:", error);
    return [];
  }
}