import AsyncStorage from "@react-native-async-storage/async-storage";

const MATURE_PODCASTS_ENABLED_KEY = "hidden_tunes_mature_podcasts_enabled_v1";

let matureEnabledMemory: boolean | null = null;

export async function isMaturePodcastsEnabled() {
  if (matureEnabledMemory !== null) return matureEnabledMemory;

  try {
    const raw = await AsyncStorage.getItem(MATURE_PODCASTS_ENABLED_KEY);
    matureEnabledMemory = raw === "true";
    return matureEnabledMemory;
  } catch {
    matureEnabledMemory = false;
    return false;
  }
}

export async function setMaturePodcastsEnabled(enabled: boolean) {
  matureEnabledMemory = enabled;
  await AsyncStorage.setItem(MATURE_PODCASTS_ENABLED_KEY, enabled ? "true" : "false");
}

export function readMaturePodcastsEnabledSync() {
  return matureEnabledMemory === true;
}
