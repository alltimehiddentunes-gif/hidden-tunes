import AsyncStorage from "@react-native-async-storage/async-storage";

const MATURE_TV_ENABLED_KEY = "hidden_tunes_mature_tv_enabled_v1";

let matureEnabledMemory: boolean | null = null;

export async function isMatureTvEnabled() {
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

export async function setMatureTvEnabled(enabled: boolean) {
  matureEnabledMemory = enabled;
  await AsyncStorage.setItem(MATURE_TV_ENABLED_KEY, enabled ? "true" : "false");
}

export function readMatureTvEnabledSync() {
  return matureEnabledMemory === true;
}
