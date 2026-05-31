import AsyncStorage from "@react-native-async-storage/async-storage";

import type { EmotionalFlowSettings } from "./emotionalFlowSettings";

const STORAGE_KEY = "hidden_tunes_emotional_flow_settings_v1";

type StringStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};

type StorageReader = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

let hasLoadedSettings = false;
let cachedSettings: EmotionalFlowSettings | null = null;
let loadPromise: Promise<EmotionalFlowSettings | null> | null = null;
let storageReader: StorageReader | null = null;

function getStorageReader(): StorageReader {
  if (storageReader) {
    return storageReader;
  }

  try {
    const { MMKV } = require("react-native-mmkv") as {
      MMKV: new (config: { id: string }) => StringStorage;
    };
    const mmkv = new MMKV({ id: "hidden-tunes-emotional-flow" });

    storageReader = {
      getItem: async (key) => mmkv.getString(key) ?? null,
      setItem: async (key, value) => {
        mmkv.set(key, value);
      },
    };
  } catch {
    storageReader = {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    };
  }

  return storageReader;
}

function normalizeSettings(
  value: Partial<EmotionalFlowSettings> | null | undefined
): EmotionalFlowSettings | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    emotionalFlowEnabled:
      typeof value.emotionalFlowEnabled === "boolean"
        ? value.emotionalFlowEnabled
        : true,
    stayInWorldEnabled:
      typeof value.stayInWorldEnabled === "boolean"
        ? value.stayInWorldEnabled
        : false,
    lateNightModeEnabled:
      typeof value.lateNightModeEnabled === "boolean"
        ? value.lateNightModeEnabled
        : false,
    activeWorldId:
      typeof value.activeWorldId === "string" && value.activeWorldId.trim()
        ? value.activeWorldId.trim()
        : null,
  };
}

export function loadEmotionalFlowSettings(): Promise<EmotionalFlowSettings | null> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    if (hasLoadedSettings) {
      return cachedSettings;
    }

    hasLoadedSettings = true;

    try {
      const raw = await getStorageReader().getItem(STORAGE_KEY);
      if (!raw) {
        cachedSettings = null;
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<EmotionalFlowSettings>;
      cachedSettings = normalizeSettings(parsed);
      return cachedSettings;
    } catch {
      cachedSettings = null;
      return null;
    }
  })();

  return loadPromise;
}

export async function saveEmotionalFlowSettings(
  settings: EmotionalFlowSettings
): Promise<void> {
  const normalized = normalizeSettings(settings);
  if (!normalized) {
    return;
  }

  cachedSettings = normalized;

  try {
    await getStorageReader().setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Persistence failures should not block in-memory updates.
  }
}
