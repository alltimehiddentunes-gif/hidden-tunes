import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "hidden_tunes_cache_";
const CACHE_TIME = 1000 * 60 * 60 * 24; // 24 hours

type CacheItem<T> = {
  savedAt: number;
  data: T;
};

export async function saveMusicCache<T>(key: string, data: T) {
  try {
    const payload: CacheItem<T> = {
      savedAt: Date.now(),
      data,
    };

    await AsyncStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify(payload)
    );
  } catch (error) {
    console.log("Save music cache error:", error);
  }
}

export async function getMusicCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);

    if (!raw) return null;

    const parsed: CacheItem<T> = JSON.parse(raw);

    const expired = Date.now() - parsed.savedAt > CACHE_TIME;

    if (expired) {
      await AsyncStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.log("Get music cache error:", error);
    return null;
  }
}

export async function clearMusicCache(key: string) {
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
  } catch (error) {
    console.log("Clear music cache error:", error);
  }
}