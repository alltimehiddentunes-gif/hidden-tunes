import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

import {
  isDiagnosticsAsyncStorageEnabled,
  isLockscreenDiagnosticsLoggingEnabled,
  isPlaybackFailureEvent,
} from "./devDiagnostics";
import { logPerformanceDiagThrottled } from "./performanceLogs";

export const LOCKSCREEN_DIAGNOSTIC_STORAGE_KEY =
  "@ht_lockscreen_playback_diagnostics_v1";

const PREFIX = "[HT_LOCKSCREEN_DIAG]";
const MAX_STORED_LOGS = 300;

type DiagnosticDetails = Record<string, unknown>;

type DiagnosticMemory = {
  lastUserAction: string;
  lastNativeEvent: string;
  lastRemoteCommand: string;
  lastBridgeEvent: string;
  lastAudioFocusOrInterruption: string;
};

export type LockscreenPlaybackDiagnosticEntry = {
  id: string;
  source: "lockscreen";
  event: string;
  at: number;
  iso: string;
  platform: string;
  appState: string;
  details: Record<string, string | number | boolean | null>;
  line: string;
};

const memory: DiagnosticMemory = {
  lastUserAction: "none",
  lastNativeEvent: "none",
  lastRemoteCommand: "none",
  lastBridgeEvent: "none",
  lastAudioFocusOrInterruption: "none",
};

let memoryLogs: LockscreenPlaybackDiagnosticEntry[] = [];
let storageHydrated = false;
let hydratePromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastSerializedPersistPayload = "";
const lastThrottledDiagAtByEvent = new Map<string, number>();

const FOREGROUND_HOT_EVENT_THROTTLE_MS = 8000;
const BACKGROUND_HOT_EVENT_THROTTLE_MS = 15000;

const THROTTLED_LOCKSCREEN_EVENTS = new Set([
  "native_playback_position",
  "native_playback_is_playing",
  "native_playback_duration",
  "native_playback_buffer_status",
  "hidden_audio_native_progress",
  "hidden_audio_now_playing_elapsed_updated",
  "native_playback_state_changed",
]);

const listeners = new Set<() => void>();

function timestamp() {
  return new Date().toISOString();
}

function rememberValue(value: string) {
  return `${value}@${timestamp()}`;
}

function compactValue(value: unknown): string | number | boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "string" && value.length > 320) {
      return `${value.slice(0, 320)}...`;
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return String(value);
    return serialized.length > 320 ? `${serialized.slice(0, 320)}...` : serialized;
  } catch {
    return String(value);
  }
}

function compactDetails(details: DiagnosticDetails) {
  const out: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(details)) {
    const compact = compactValue(value);
    if (compact !== undefined) {
      out[key] = compact;
    }
  }

  return out;
}

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // diagnostics listeners should never affect playback
    }
  });
}

async function persistLogs() {
  try {
    const payload = JSON.stringify(memoryLogs);
    if (payload === lastSerializedPersistPayload) return;
    lastSerializedPersistPayload = payload;
    await AsyncStorage.setItem(
      LOCKSCREEN_DIAGNOSTIC_STORAGE_KEY,
      JSON.stringify(memoryLogs)
    );
  } catch {
    // storage failures must not affect playback
  }
}

function schedulePersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistLogs();
  }, 2800);
  logPerformanceDiagThrottled("lockscreen_playback_diagnostics", {
    debounceMs: 2800,
  });
}

function formatLogLine(event: string, details: Record<string, unknown>) {
  return `${PREFIX} ${event} ${JSON.stringify(details)}`;
}

function createEntry(
  event: string,
  details: DiagnosticDetails
): LockscreenPlaybackDiagnosticEntry {
  const at = Date.now();
  const compact = compactDetails({
    ...details,
    at,
    platform: Platform.OS,
    appState: AppState.currentState,
  });

  return {
    id: `${at}-${Math.random().toString(36).slice(2, 9)}`,
    source: "lockscreen",
    event,
    at,
    iso: new Date(at).toISOString(),
    platform: String(compact.platform ?? Platform.OS),
    appState: String(compact.appState ?? AppState.currentState),
    details: compact,
    line: formatLogLine(event, compact),
  };
}

function shouldThrottleLockscreenEvent(event: string) {
  if (!THROTTLED_LOCKSCREEN_EVENTS.has(event)) return false;

  const state = AppState.currentState;
  const throttleMs =
    state === "background" || state === "inactive"
      ? BACKGROUND_HOT_EVENT_THROTTLE_MS
      : FOREGROUND_HOT_EVENT_THROTTLE_MS;
  const now = Date.now();
  const lastAt = lastThrottledDiagAtByEvent.get(event) ?? 0;

  if (now - lastAt < throttleMs) return true;

  lastThrottledDiagAtByEvent.set(event, now);
  return false;
}

function shouldRecordLockscreenEvent(event: string) {
  if (isLockscreenDiagnosticsLoggingEnabled()) return true;
  return isPlaybackFailureEvent(event);
}

function appendLog(entry: LockscreenPlaybackDiagnosticEntry) {
  if (!shouldRecordLockscreenEvent(entry.event)) return;

  memoryLogs = [...memoryLogs, entry].slice(-MAX_STORED_LOGS);
  notifyListeners();

  if (isDiagnosticsAsyncStorageEnabled()) {
    schedulePersist();
  }
}

export function subscribeLockscreenPlaybackDiagnostics(
  listener: () => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLockscreenPlaybackDiagnosticLogs() {
  return [...memoryLogs];
}

export async function hydrateLockscreenPlaybackDiagnostics(): Promise<void> {
  if (storageHydrated) return;

  if (hydratePromise) {
    await hydratePromise;
    return;
  }

  hydratePromise = (async () => {
    const raw = await AsyncStorage.getItem(LOCKSCREEN_DIAGNOSTIC_STORAGE_KEY);
    if (!raw) {
      storageHydrated = true;
      notifyListeners();
      return;
    }

    const parsed = JSON.parse(raw) as LockscreenPlaybackDiagnosticEntry[];
    if (!Array.isArray(parsed)) {
      storageHydrated = true;
      notifyListeners();
      return;
    }

    memoryLogs = parsed
      .filter((entry) => entry && typeof entry.event === "string")
      .map((entry) => ({
        ...entry,
        source: "lockscreen" as const,
        at: typeof entry.at === "number" ? entry.at : Date.parse(entry.iso || ""),
        iso: entry.iso || new Date(entry.at || Date.now()).toISOString(),
        platform: entry.platform || "unknown",
        appState: entry.appState || "unknown",
        details: entry.details || {},
        line: entry.line || formatLogLine(entry.event, entry.details || {}),
      }))
      .filter((entry) => Number.isFinite(entry.at))
      .slice(-MAX_STORED_LOGS);

    storageHydrated = true;
    notifyListeners();
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export async function reloadLockscreenPlaybackDiagnostics(): Promise<
  LockscreenPlaybackDiagnosticEntry[]
> {
  storageHydrated = false;
  await hydrateLockscreenPlaybackDiagnostics();
  return getLockscreenPlaybackDiagnosticLogs();
}

export async function clearLockscreenPlaybackDiagnostics(): Promise<void> {
  memoryLogs = [];
  storageHydrated = true;

  try {
    await AsyncStorage.removeItem(LOCKSCREEN_DIAGNOSTIC_STORAGE_KEY);
  } catch {
    // ignore storage cleanup failures in diagnostics
  }

  notifyListeners();
}

export function formatLockscreenPlaybackDiagnosticsForExport(
  logs: LockscreenPlaybackDiagnosticEntry[] = memoryLogs
): string {
  return logs.map((entry) => `${entry.iso} ${entry.line}`).join("\n");
}

export function rememberLockscreenDiagnostic(
  key: keyof DiagnosticMemory,
  value: string
) {
  memory[key] = rememberValue(value);
}

export function getLockscreenDiagnosticSnapshot(): DiagnosticMemory {
  return { ...memory };
}

export function logLockscreenPlaybackDiagnostic(
  event: string,
  details: DiagnosticDetails = {}
) {
  if (shouldThrottleLockscreenEvent(event)) return;

  const entry = createEntry(event, details);

  if (__DEV__) {
    console.log(`[HTLockscreenDiag] ${event}`, {
      ...details,
      timestamp: entry.iso,
    });
  }

  appendLog(entry);
}

export function logAndRememberLockscreenDiagnostic(
  event: string,
  details: DiagnosticDetails = {},
  remember?: Partial<Record<keyof DiagnosticMemory, string>>
) {
  if (remember) {
    for (const [key, value] of Object.entries(remember)) {
      if (value) {
        memory[key as keyof DiagnosticMemory] = rememberValue(value);
      }
    }
  }

  logLockscreenPlaybackDiagnostic(event, details);
}

if (isDiagnosticsAsyncStorageEnabled()) {
  void hydrateLockscreenPlaybackDiagnostics().catch(() => {
    // Diagnostics hydration must never affect app startup.
  });
}

export function isInterruptionHiddenAudioStopReason(reason: string) {
  return (
    reason === "remote_pause" ||
    reason === "audio_focus_loss" ||
    reason === "audio_focus_transient" ||
    reason === "audio_focus_duck" ||
    reason === "phone_call" ||
    reason === "task_removed" ||
    reason === "intentional_app_close" ||
    reason.startsWith("interruption_")
  );
}

export function isUserInitiatedHiddenAudioStopReason(reason: string) {
  return (
    reason === "stop_playback" ||
    reason === "owner_transfer" ||
    reason === "user_tap_interrupt" ||
    reason.startsWith("user_") ||
    isInterruptionHiddenAudioStopReason(reason)
  );
}
