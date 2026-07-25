/**
 * Temporary Android continuous-playback diagnostics.
 * Logs [HTAndroidContinuousPlayback] for one-tap start analysis.
 */

import { Platform } from "react-native";

export type AndroidContinuousPlaybackTracePayload = Record<string, unknown>;

let tapStartedAtMs = 0;
let activeRequestId = "";
let activeSongId = "";

export function beginAndroidContinuousPlaybackTap(details: {
  requestId?: string;
  songId?: string;
  source?: string;
  canonicalSongIdentity?: string;
}) {
  if (Platform.OS !== "android") return;
  tapStartedAtMs = Date.now();
  activeRequestId = String(details.requestId || `tap_${tapStartedAtMs}`);
  activeSongId = String(details.songId || "");
  logAndroidContinuousPlaybackTrace("tap_received", {
    requestId: activeRequestId,
    songId: activeSongId,
    canonicalSongIdentity: details.canonicalSongIdentity || activeSongId,
    commandSource: details.source || "ui_tap",
    elapsedMsFromTap: 0,
  });
}

export function logAndroidContinuousPlaybackTrace(
  event: string,
  details: AndroidContinuousPlaybackTracePayload = {}
) {
  if (Platform.OS !== "android") return;
  const elapsedMsFromTap =
    typeof details.elapsedMsFromTap === "number"
      ? details.elapsedMsFromTap
      : tapStartedAtMs > 0
        ? Date.now() - tapStartedAtMs
        : -1;
  const payload = {
    event,
    requestId: details.requestId || activeRequestId || null,
    songId: details.songId || activeSongId || null,
    timestamp: Date.now(),
    elapsedMsFromTap,
    ...details,
  };
  if (__DEV__) {
    console.log(`[HTAndroidContinuousPlayback] ${event}`, payload);
  }
}

export function mirrorNativeContinuousPlaybackDiagnostic(
  eventName: string,
  data: Record<string, unknown> = {}
) {
  if (Platform.OS !== "android") return;
  if (eventName === "ht_android_continuous_playback") {
    const event = String(data.event || "native_event");
    logAndroidContinuousPlaybackTrace(event, data);
    return;
  }
  if (eventName === "ht_android_lifecycle") {
    const event = String(data.event || "lifecycle_event");
    if (__DEV__) {
      console.log(`[HTAndroidLifecycle] ${event}`, {
        ...data,
        timestamp: Date.now(),
      });
    }
  }
}
