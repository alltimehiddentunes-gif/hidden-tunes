import { AppState, Platform, type AppStateStatus } from "react-native";

const PREFIX = "[HT_PLAYBACK_CRITICAL]";

export type PlaybackCriticalDetails = Record<
  string,
  string | number | boolean | null | undefined
>;

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

let lastDedupeKey = "";
let lastDedupeAt = 0;

function shouldSkipDuplicate(event: string, dedupeKey: string): boolean {
  const composite = `${event}:${dedupeKey}`;
  const now = Date.now();

  if (composite === lastDedupeKey && now - lastDedupeAt < 350) {
    return true;
  }

  lastDedupeKey = composite;
  lastDedupeAt = now;
  return false;
}

/** Production-safe; always emitted. No progress / tick spam. */
export function logPlaybackCritical(
  event: string,
  details: PlaybackCriticalDetails = {}
): void {
  console.warn(
    `${PREFIX} ${event}`,
    compactDetails({
      at: Date.now(),
      platform: Platform.OS,
      appState: AppState.currentState,
      ...details,
    })
  );
}

export function logPlaybackCriticalAppState(
  previousState: AppStateStatus,
  nextState: AppStateStatus,
  details: PlaybackCriticalDetails = {}
): void {
  const dedupeKey = `${previousState}->${nextState}`;

  if (shouldSkipDuplicate("app_state_change", dedupeKey)) return;

  logPlaybackCritical("app_state_change", {
    previousState,
    nextState,
    ...details,
  });
}

export function logPlaybackCriticalIsPlayingFalse(
  reason: string,
  details: PlaybackCriticalDetails = {}
): void {
  logPlaybackCritical("is_playing_false", {
    reason,
    ...details,
  });
}

export function subscribePlaybackCriticalMemoryWarning(
  handler: () => void
): () => void {
  if (Platform.OS !== "ios") {
    return () => undefined;
  }

  const subscription = AppState.addEventListener("memoryWarning", handler);
  return () => subscription.remove();
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error ?? "unknown");
}
