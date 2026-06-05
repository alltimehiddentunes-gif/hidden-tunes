import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

const PREFIX = "[HT_PLAYBACK_CRITICAL]";
const STORAGE_KEY = "@ht_playback_critical_logs_v1";
const MAX_STORED_LOGS = 100;

export type PlaybackCriticalDetails = Record<
  string,
  string | number | boolean | null | undefined
>;

export type PlaybackCriticalLogEntry = {
  id: string;
  event: string;
  at: number;
  platform: string;
  appState: string;
  details: PlaybackCriticalDetails;
  line: string;
};

let memoryLogs: PlaybackCriticalLogEntry[] = [];
let storageHydrated = false;
let hydratePromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastSerializedPersistPayload = "";

const listeners = new Set<() => void>();

function compactDetails(details: PlaybackCriticalDetails): PlaybackCriticalDetails {
  const out: PlaybackCriticalDetails = {};

  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue;

    if (typeof value === "string" && value.length > 240) {
      out[key] = `${value.slice(0, 240)}…`;
      continue;
    }

    out[key] = value;
  }

  return out;
}

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistPlaybackCriticalLogs();
  }, 1200);
}

async function persistPlaybackCriticalLogs() {
  try {
    const payload = JSON.stringify(memoryLogs);
    if (payload === lastSerializedPersistPayload) return;
    lastSerializedPersistPayload = payload;
    await AsyncStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // storage failures must not affect playback
  }
}

function formatLogLine(
  event: string,
  details: PlaybackCriticalDetails
): string {
  return `${PREFIX} ${event} ${JSON.stringify(details)}`;
}

function createLogEntry(
  event: string,
  details: PlaybackCriticalDetails
): PlaybackCriticalLogEntry {
  const compact = compactDetails({
    at: Date.now(),
    platform: Platform.OS,
    appState: AppState.currentState,
    ...details,
  });

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    event,
    at: typeof compact.at === "number" ? compact.at : Date.now(),
    platform: String(compact.platform ?? Platform.OS),
    appState: String(compact.appState ?? AppState.currentState),
    details: compact,
    line: formatLogLine(event, compact),
  };
}

function appendLogEntry(entry: PlaybackCriticalLogEntry) {
  memoryLogs = [...memoryLogs, entry].slice(-MAX_STORED_LOGS);
  notifyListeners();
  schedulePersist();
}

export function subscribePlaybackCriticalLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlaybackCriticalLogs(): PlaybackCriticalLogEntry[] {
  return [...memoryLogs];
}

export async function hydratePlaybackCriticalLogs(): Promise<void> {
  if (storageHydrated) return;

  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as PlaybackCriticalLogEntry[];
      if (!Array.isArray(parsed)) return;

      memoryLogs = parsed
        .filter((entry) => entry && typeof entry.event === "string")
        .slice(-MAX_STORED_LOGS);
    } catch {
      // ignore corrupt storage
    } finally {
      storageHydrated = true;
      notifyListeners();
    }
  })();

  await hydratePromise;
  hydratePromise = null;
}

export async function clearPlaybackCriticalLogs(): Promise<void> {
  memoryLogs = [];
  storageHydrated = true;

  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }

  notifyListeners();
}

export function formatPlaybackCriticalLogsForExport(
  logs: PlaybackCriticalLogEntry[] = memoryLogs
): string {
  return logs
    .map((entry) => {
      const iso = new Date(entry.at).toISOString();
      return `${iso} ${entry.line}`;
    })
    .join("\n");
}

/** Production-safe; always emitted. No progress / tick spam. */
export function logPlaybackCritical(
  event: string,
  details: PlaybackCriticalDetails = {}
): void {
  const entry = createLogEntry(event, details);

  console.warn(entry.line, entry.details);
  appendLogEntry(entry);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error ?? "unknown");
}

// Hydrated on demand from playback-diagnostics screen.
