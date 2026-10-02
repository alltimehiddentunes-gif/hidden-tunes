import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

type NativePerfModule = {
  getPerformanceSnapshot?: () => Promise<Record<string, unknown>>;
  resetPerformanceSnapshot?: () => Promise<void>;
  getDiagnosticSnapshot?: () => Promise<Record<string, unknown>>;
  setDiagnosticMode?: (mode: string) => Promise<{ mode?: string } | string | null>;
};

/** Production-like baseline used for NORMAL physical arm of 217 isolation A/B. */
export const IOS217_NORMAL_DIAGNOSTIC_MODE = "quiet_diagnostics";

/** Runtime-selectable DEV-ONLY isolation modes (requires diagnostic native rebuild). */
export const IOS217_DIAGNOSTIC_ISOLATION_MODES = [
  "quiet_diagnostics",
  "normal",
  "event_minimum",
  "no_redundant_state",
  "no_now_playing_periodic",
  "no_periodic_confirm",
  "no_periodic_ancillary",
  "audio_core_only",
] as const;

export type Ios217DiagnosticIsolationMode =
  (typeof IOS217_DIAGNOSTIC_ISOLATION_MODES)[number];

export const IOS217_EVENT_MINIMUM_MODE: Ios217DiagnosticIsolationMode = "event_minimum";

const MODE_HELP: Record<Ios217DiagnosticIsolationMode, string> = {
  quiet_diagnostics: "NORMAL product-like baseline (quiet diag while playing)",
  normal: "Full diagnostic print/bridge chatter",
  event_minimum: "Skip redundant unchanged HiddenAudioState; keep progress + Now Playing + end",
  no_redundant_state: "Alias of event_minimum (redundant state emit suppress)",
  no_now_playing_periodic: "Skip periodic Now Playing elapsed only",
  no_periodic_confirm: "Skip confirmPlayingIfNeeded on periodic when already playing",
  no_periodic_ancillary: "Progress + end only; skip elapsed + periodic confirm",
  audio_core_only: "No periodic observer; audio + end/controls only (UI progress may freeze)",
};

function nativeModule(): NativePerfModule | null {
  if (Platform.OS !== "ios" || Constants.expoConfig?.extra?.isDevClientBuild !== true) return null;
  return (NativeModules.HiddenAudioModule as NativePerfModule | undefined) ?? null;
}

function applyModeResult(result: { mode?: string } | string | null | undefined, fallback: string) {
  const applied =
    typeof result === "string"
      ? result
      : result && typeof result === "object" && typeof result.mode === "string"
        ? result.mode
        : fallback;
  (globalThis as typeof globalThis & { __htNativeDiagnosticMode?: string }).__htNativeDiagnosticMode =
    applied;
  return applied;
}

export async function resetIos217NativePerf(): Promise<void> {
  const native = nativeModule();
  if (!native?.resetPerformanceSnapshot) throw new Error("217 native performance recorder is unavailable");
  await native.resetPerformanceSnapshot();
}

export async function setIos217DiagnosticIsolationMode(
  mode: Ios217DiagnosticIsolationMode
): Promise<string> {
  const native = nativeModule();
  if (!native?.setDiagnosticMode) {
    throw new Error("Diagnostic isolation modes require the 217 diagnostic native client");
  }
  try {
    return applyModeResult(await native.setDiagnosticMode(mode), mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Mode ${mode} rejected (${message}). Rebuild ios217PerfDiagnostic with the full isolation allowlist.`
    );
  }
}

/** @deprecated Prefer setIos217DiagnosticIsolationMode — kept for prior More toggle. */
export async function setIos217PlaybackEventMinimumMode(enabled: boolean): Promise<string> {
  return setIos217DiagnosticIsolationMode(
    enabled ? IOS217_EVENT_MINIMUM_MODE : IOS217_NORMAL_DIAGNOSTIC_MODE
  );
}

export function getIos217DiagnosticIsolationMode(): string {
  return (
    (globalThis as typeof globalThis & { __htNativeDiagnosticMode?: string }).__htNativeDiagnosticMode ||
    IOS217_NORMAL_DIAGNOSTIC_MODE
  );
}

export function getIos217PlaybackEventMinimumModeEnabled(): boolean {
  const mode = getIos217DiagnosticIsolationMode();
  return mode === "event_minimum" || mode === "no_redundant_state";
}

export function describeIos217DiagnosticIsolationMode(mode: string): string {
  return MODE_HELP[mode as Ios217DiagnosticIsolationMode] || mode;
}

export function cycleIos217DiagnosticIsolationMode(
  current: string
): Ios217DiagnosticIsolationMode {
  const list = IOS217_DIAGNOSTIC_ISOLATION_MODES;
  const index = list.indexOf(current as Ios217DiagnosticIsolationMode);
  return list[(index + 1) % list.length];
}

export async function readIos217NativePerf(): Promise<string> {
  const native = nativeModule();
  if (!native?.getPerformanceSnapshot) return "nativeRecorder=unavailable";
  const [perf, playback] = await Promise.all([
    native.getPerformanceSnapshot(),
    native.getDiagnosticSnapshot?.().catch(() => null) ?? Promise.resolve(null),
  ]);
  const mode = getIos217DiagnosticIsolationMode();
  return `diagnosticIsolationMode=${mode}\nplaybackEventMinimumMode=${
    mode === "event_minimum" || mode === "no_redundant_state"
  }\nnativeRecorder=${JSON.stringify(perf)}\nnativePlayback=${JSON.stringify(playback ?? "unavailable")}`;
}
