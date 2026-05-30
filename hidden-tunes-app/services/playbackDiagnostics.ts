// TEMP_PLAYBACK_DIAGNOSTICS
// Temporary diagnostic tool for root-cause testing.
// Safe to remove after playback stabilization.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

const LOG_PREFIX = "[HT_PLAYBACK_DIAG]";
const STORAGE_KEY = "hidden_tunes_playback_diagnostics_v1";
const SESSION_STORAGE_KEY = "hidden_tunes_playback_diagnostics_session_v1";
const MAX_LOGS = 1000;
const MAX_STRING_LENGTH = 600;
const MAX_DATA_KEYS = 40;
const MAX_ARRAY_ITEMS = 20;
const MAX_DEPTH = 2;
const DEFAULT_CHURN_WINDOW_MS = 10000;
const DEFAULT_CHURN_THRESHOLD = 3;

export type PlaybackDiagnosticEntry = {
  id: string;
  sessionId: string;
  timestamp: string;
  platform: string;
  eventName: string;
  data?: Record<string, unknown>;
};

let sessionId = createSessionId();
let memoryLogs: PlaybackDiagnosticEntry[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const churnWindows = new Map<string, { startedAt: number; count: number; warnedAt: number }>();

function createSessionId(): string {
  return `htdiag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...`;
}

function sanitizeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  try {
    if (value == null) return value;

    const valueType = typeof value;
    if (valueType === "function" || valueType === "symbol") return undefined;
    if (valueType === "string") return truncateString(value as string);
    if (valueType === "number" || valueType === "boolean") return value;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return {
        name: truncateString(value.name),
        message: truncateString(value.message),
      };
    }

    if (valueType !== "object") return truncateString(String(value));
    if (depth >= MAX_DEPTH) return "[Object]";

    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) return "[Circular]";
    seen.add(objectValue);

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitizeValue(item, depth + 1, seen))
        .filter((item) => item !== undefined);
    }

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(objectValue).slice(0, MAX_DATA_KEYS)) {
      const sanitized = sanitizeValue(item, depth + 1, seen);
      if (sanitized !== undefined) {
        output[truncateString(key)] = sanitized;
      }
    }

    return output;
  } catch {
    return "[Unserializable]";
  }
}

function sanitizeData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  try {
    if (!data || typeof data !== "object") return undefined;
    const sanitized = sanitizeValue(data, 0, new WeakSet<object>());
    if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
      return undefined;
    }
    return sanitized as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function notifyListeners(): void {
  try {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Ignore listener failures.
      }
    });
  } catch {
    // Diagnostics must never throw.
  }
}

function safeParseLogs(raw: string | null): PlaybackDiagnosticEntry[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry) => {
        return (
          entry &&
          typeof entry.id === "string" &&
          typeof entry.sessionId === "string" &&
          typeof entry.timestamp === "string" &&
          typeof entry.eventName === "string"
        );
      })
      .slice(-MAX_LOGS);
  } catch {
    return [];
  }
}

async function hydrateDiagnostics(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    try {
      const [storedLogs, storedSessionId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(SESSION_STORAGE_KEY),
      ]);

      memoryLogs = safeParseLogs(storedLogs);
      if (storedSessionId) {
        sessionId = truncateString(storedSessionId);
      } else {
        await AsyncStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      }
    } catch {
      // Diagnostics must never block app startup or playback.
    } finally {
      hydrated = true;
      notifyListeners();
    }
  })();

  try {
    await hydratePromise;
  } catch {
    // Diagnostics must never throw.
  } finally {
    hydratePromise = null;
  }
}

function persistSoon(): void {
  try {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persistNow();
    }, 350);
  } catch {
    void persistNow();
  }
}

async function persistNow(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memoryLogs.slice(-MAX_LOGS)));
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage failures.
  }
}

function appendEntry(entry: PlaybackDiagnosticEntry): void {
  try {
    memoryLogs = [...memoryLogs, entry].slice(-MAX_LOGS);
    if (shouldConsoleLogEntry(entry.eventName)) {
      console.log(LOG_PREFIX, entry.eventName, entry);
    }
    notifyListeners();
    persistSoon();
  } catch {
    // Diagnostics must never throw.
  }
}

function shouldConsoleLogEntry(eventName: string): boolean {
  return (
    eventName.startsWith("hidden_audio_") ||
    eventName.includes("playback") ||
    eventName.includes("audio") ||
    eventName === "app_state_change" ||
    eventName === "session_start"
  );
}

export function subscribePlaybackDiagnostics(listener: () => void): () => void {
  try {
    listeners.add(listener);
  } catch {
    // Diagnostics must never throw.
  }

  return () => {
    try {
      listeners.delete(listener);
    } catch {
      // Diagnostics must never throw.
    }
  };
}

export function logPlaybackDiagnostic(
  eventName: string,
  data?: Record<string, unknown>
): Promise<void> | void {
  try {
    const safeEventName = truncateString(String(eventName || "unknown_event"));
    const entry: PlaybackDiagnosticEntry = {
      id: createEntryId(),
      sessionId,
      timestamp: new Date().toISOString(),
      platform: Platform.OS,
      eventName: safeEventName,
      data: sanitizeData({ appState: AppState.currentState, ...data }),
    };

    appendEntry(entry);

    if (!hydrated) {
      return hydrateDiagnostics()
        .then(() => {
          memoryLogs = [...memoryLogs, entry].slice(-MAX_LOGS);
          persistSoon();
        })
        .catch(() => undefined);
    }
  } catch {
    // Diagnostics must never throw.
  }
}

export function logPlaybackDiagnosticChurnWarning(
  category: string,
  data: Record<string, unknown> = {},
  threshold = DEFAULT_CHURN_THRESHOLD,
  windowMs = DEFAULT_CHURN_WINDOW_MS
): void {
  try {
    const now = Date.now();
    const key = truncateString(String(category || "unknown_churn"));
    const existing = churnWindows.get(key);
    const activeWindow =
      existing && now - existing.startedAt <= windowMs
        ? existing
        : { startedAt: now, count: 0, warnedAt: 0 };

    activeWindow.count += 1;
    churnWindows.set(key, activeWindow);

    if (activeWindow.count !== threshold) return;
    if (activeWindow.warnedAt && now - activeWindow.warnedAt <= windowMs) return;

    activeWindow.warnedAt = now;
    void logPlaybackDiagnostic("diagnostic_churn_warning", {
      category: key,
      count: activeWindow.count,
      windowMs,
      ...data,
    });
  } catch {
    // Diagnostics must never throw.
  }
}

export async function getPlaybackDiagnostics(): Promise<PlaybackDiagnosticEntry[]> {
  try {
    await hydrateDiagnostics();
    return [...memoryLogs];
  } catch {
    return [...memoryLogs];
  }
}

export async function clearPlaybackDiagnostics(): Promise<void> {
  try {
    memoryLogs = [];
    hydrated = true;
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Diagnostics must never throw.
  } finally {
    notifyListeners();
  }
}

export async function startPlaybackDiagnosticSession(reason?: string): Promise<string> {
  try {
    await hydrateDiagnostics();
    sessionId = createSessionId();
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    await logPlaybackDiagnostic("session_start", reason ? { reason } : undefined);
  } catch {
    // Diagnostics must never throw.
  }

  return sessionId;
}

export function getPlaybackDiagnosticSessionId(): string {
  try {
    return sessionId;
  } catch {
    return "unknown";
  }
}

export async function exportPlaybackDiagnosticsText(): Promise<string> {
  try {
    const logs = await getPlaybackDiagnostics();
    return logs
      .map((entry) => {
        const dataText = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
        return `${entry.timestamp} ${LOG_PREFIX} session=${entry.sessionId} platform=${entry.platform} event=${entry.eventName}${dataText}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}
