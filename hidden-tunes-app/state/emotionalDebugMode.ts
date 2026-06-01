import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "hidden_tunes_emotional_debug_mode_v1";

type StringStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
};

type StorageReader = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

let debugEnabled = false;
let hasLoadedDebugMode = false;
let loadPromise: Promise<boolean> | null = null;
let storageReader: StorageReader | null = null;

const listeners = new Set<() => void>();

function getStorageReader(): StorageReader {
  if (storageReader) {
    return storageReader;
  }

  try {
    const { MMKV } = require("react-native-mmkv") as {
      MMKV: new (config: { id: string }) => StringStorage;
    };
    const mmkv = new MMKV({ id: "hidden-tunes-emotional-debug" });

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

function notifyEmotionalDebugModeListeners() {
  listeners.forEach((listener) => listener());
}

async function persistDebugMode() {
  try {
    await getStorageReader().setItem(
      STORAGE_KEY,
      JSON.stringify({ debugEnabled })
    );
  } catch {
    // Local persistence failures should not block toggling.
  }
}

export function loadEmotionalDebugMode(): Promise<boolean> {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    if (hasLoadedDebugMode) {
      return debugEnabled;
    }

    hasLoadedDebugMode = true;

    try {
      const raw = await getStorageReader().getItem(STORAGE_KEY);
      if (!raw) {
        return debugEnabled;
      }

      const parsed = JSON.parse(raw) as { debugEnabled?: boolean };
      debugEnabled = Boolean(parsed.debugEnabled);
    } catch {
      debugEnabled = false;
    }

    notifyEmotionalDebugModeListeners();
    return debugEnabled;
  })();

  return loadPromise;
}

export function getEmotionalDebugEnabled() {
  return debugEnabled;
}

export function subscribeEmotionalDebugMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setEmotionalDebugEnabled(value: boolean) {
  if (debugEnabled === value) {
    return;
  }

  debugEnabled = value;
  void persistDebugMode();
  notifyEmotionalDebugModeListeners();
}

export function toggleDebugMode() {
  setEmotionalDebugEnabled(!debugEnabled);
}

void loadEmotionalDebugMode();
