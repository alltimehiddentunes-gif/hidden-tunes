import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import { getNowPlayingSnapshot } from "./nowPlayingStore";
import {
  formatIos217PlaybackSample,
  Ios217PlaybackDiagnosticCore,
  type PlaybackSampleCounter,
} from "./ios217PlaybackDiagnosticCore";

// This module is inert outside the one TestFlight 217 diagnostic OTA.
export const IOS217_DIAGNOSTIC_ENABLED =
  Platform.OS === "ios" &&
  process.env.EXPO_PUBLIC_IOS217_DIAGNOSTIC === "1" &&
  Constants.expoConfig?.version === "1.0.3" &&
  Constants.platform?.ios?.buildNumber === "1.0.217" &&
  Updates.runtimeVersion === "1.0.3-production.1.0.217";

const core = new Ios217PlaybackDiagnosticCore();
let heartbeat: ReturnType<typeof setInterval> | null = null;
let armedForHome = false;
let previousPlaybackCounter: ((kind: string) => void) | undefined;
let previousDiagnosticCounter: ((kind: PlaybackSampleCounter) => void) | undefined;
let previousTapCounter: ((ms: number, nativeTimestamp?: boolean) => void) | undefined;
let previousHomeStart: (() => void) | undefined;
let lastReport = "";
type CounterGlobal = typeof globalThis & {
  __htCountPlayback?: (kind: string) => void;
  __htCountIos217?: (kind: PlaybackSampleCounter) => void;
  __htCountIos217Tap?: (ms: number, nativeTimestamp?: boolean) => void;
  __htStartIos217OnHome?: () => void;
};

function mode() {
  return getNowPlayingSnapshot().isPlaying ? "playing" as const : "paused" as const;
}

function countPlayback(kind: string) {
  if (kind === "jsProgressCallback") core.count("progressCallbacks");
  else if (kind === "jsProgressApplied") core.count("progressApplied");
  previousPlaybackCounter?.(kind);
}

function countDiagnostic(kind: PlaybackSampleCounter) {
  core.count(kind);
}

function countTap(ms: number, nativeTimestamp = false) {
  core.tapLatency(ms, nativeTimestamp);
  previousTapCounter?.(ms, nativeTimestamp);
}

export function startIos217PlaybackSample() {
  if (!IOS217_DIAGNOSTIC_ENABLED) return false;
  stopIos217PlaybackSample();
  core.reset();
  if (mode() !== "paused") return false;
  lastReport = "";
  const globals = globalThis as CounterGlobal;
  armedForHome = true;
  previousHomeStart = globals.__htStartIos217OnHome;
  globals.__htStartIos217OnHome = beginOnHome;
  return true;
}

function beginOnHome() {
  if (!armedForHome || mode() !== "paused" || !core.start("paused")) return;
  armedForHome = false;
  const globals = globalThis as CounterGlobal;
  if (globals.__htStartIos217OnHome === beginOnHome) globals.__htStartIos217OnHome = previousHomeStart;
  previousHomeStart = undefined;
  previousPlaybackCounter = globals.__htCountPlayback;
  previousDiagnosticCounter = globals.__htCountIos217;
  previousTapCounter = globals.__htCountIos217Tap;
  globals.__htCountPlayback = countPlayback;
  globals.__htCountIos217 = countDiagnostic;
  globals.__htCountIos217Tap = countTap;
  heartbeat = setInterval(() => core.tick(mode()), 100);
}

export function stopIos217PlaybackSample() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  const globals = globalThis as CounterGlobal;
  armedForHome = false;
  if (globals.__htStartIos217OnHome === beginOnHome) globals.__htStartIos217OnHome = previousHomeStart;
  previousHomeStart = undefined;
  if (globals.__htCountPlayback === countPlayback) globals.__htCountPlayback = previousPlaybackCounter;
  if (globals.__htCountIos217 === countDiagnostic) globals.__htCountIos217 = previousDiagnosticCounter;
  if (globals.__htCountIos217Tap === countTap) globals.__htCountIos217Tap = previousTapCounter;
  previousPlaybackCounter = undefined;
  previousDiagnosticCounter = undefined;
  previousTapCounter = undefined;
  if (core.snapshot().phases.length) {
    lastReport = formatIos217PlaybackSample(core.stop());
  }
  return lastReport;
}

export function resetIos217PlaybackSample() {
  stopIos217PlaybackSample();
  core.reset();
  lastReport = "";
}

export function getIos217PlaybackSampleStatus() {
  return { active: core.isActive(), phase: armedForHome ? "armed for Home" : core.phaseLabel(), report: lastReport };
}

export function countIos217Diagnostic(key: PlaybackSampleCounter) {
  if (IOS217_DIAGNOSTIC_ENABLED) core.count(key);
}

export function countIos217Render(surface: "home" | "appShell" | "miniPlayer" | "policy") {
  if (!IOS217_DIAGNOSTIC_ENABLED) return;
  const key: PlaybackSampleCounter =
    surface === "home" ? "homeRenders" :
    surface === "appShell" ? "appShellRenders" :
    surface === "miniPlayer" ? "miniPlayerRenders" : "policyRenders";
  core.count(key);
}

export function countIos217TabLatency(ms: number) {
  if (IOS217_DIAGNOSTIC_ENABLED) core.tapLatency(ms);
}
