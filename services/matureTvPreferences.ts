import AsyncStorage from "@react-native-async-storage/async-storage";

const MATURE_TV_ENABLED_KEY = "hidden_tunes_mature_tv_enabled_v1";

let matureEnabledMemory: boolean | null = null;

export async function getMatureTvEnabled() {
  if (matureEnabledMemory !== null) return matureEnabledMemory;

  try {
    const raw = await AsyncStorage.getItem(MATURE_TV_ENABLED_KEY);
    matureEnabledMemory = raw === "true";
    return matureEnabledMemory;
  } catch {
    matureEnabledMemory = false;
    return false;
  }
}

/** @deprecated Use getMatureTvEnabled */
export async function isMatureTvEnabled() {
  return getMatureTvEnabled();
}

export async function setMatureTvEnabled(enabled: boolean) {
  matureEnabledMemory = enabled;
  await AsyncStorage.setItem(MATURE_TV_ENABLED_KEY, enabled ? "true" : "false");
}

export async function clearMatureTvPreference() {
  matureEnabledMemory = false;

  try {
    await AsyncStorage.removeItem(MATURE_TV_ENABLED_KEY);
  } catch {}
}

export function readMatureTvEnabledSync() {
  return matureEnabledMemory === true;
}
