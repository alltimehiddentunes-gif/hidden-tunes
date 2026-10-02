import Constants from "expo-constants";
import { Platform } from "react-native";
import { getNowPlayingSnapshot } from "./nowPlayingStore";
import {
  describeIos217HomeClippingMode,
  formatIos217HomeRenderReasons,
  resetIos217HomeFabricAb,
  setIos217HomeFabricSampleActive,
  setIos217HomeRemoveClippedSubviewsOverride,
} from "./ios217HomeFabricAb";
import {
  formatIos217FabricWorkload,
  resetIos217FabricWorkload,
  setIos217FabricWorkloadSampleActive,
} from "./ios217FabricWorkload";
import {
  formatIos217PlaybackSample,
  Ios217PlaybackDiagnosticCore,
  type PlaybackSampleCounter,
} from "./ios217PlaybackDiagnosticCore";

// This module is inert outside the isolated 217 internal development client.
export const IOS217_DIAGNOSTIC_ENABLED =
  Platform.OS === "ios" &&
  Constants.expoConfig?.extra?.isDevClientBuild === true &&
  Constants.expoConfig?.version === "1.0.3" &&
  Constants.platform?.ios?.buildNumber === "1.0.217";

const core = new Ios217PlaybackDiagnosticCore();
let heartbeat: ReturnType<typeof setInterval> | null = null;
let armWatcher: ReturnType<typeof setInterval> | null = null;
let armedForHome = false;
let armedForFabricCompare = false;
let armedForPlayingAb = false;
let previousPlaybackCounter: ((kind: string) => void) | undefined;
let previousDiagnosticCounter: ((kind: PlaybackSampleCounter) => void) | undefined;
let previousTapCounter: ((ms: number, nativeTimestamp?: boolean) => void) | undefined;
let previousHomeStart: (() => void) | undefined;
let lastReport = "";
/** DEV/217 diagnostic only. Default OFF. Does not touch native playback. */
let suppressJsProgressPublication = false;
type CounterGlobal = typeof globalThis & {
  __htCountPlayback?: (kind: string) => void;
  __htCountIos217?: (kind: PlaybackSampleCounter) => void;
  __htCountIos217Tap?: (ms: number, nativeTimestamp?: boolean) => void;
  __htStartIos217OnHome?: () => void;
};

function mode() {
  return getNowPlayingSnapshot().isPlaying ? ("playing" as const) : ("paused" as const);
}

export function isIos217JsProgressPublicationSuppressed(): boolean {
  return IOS217_DIAGNOSTIC_ENABLED && suppressJsProgressPublication;
}

export function setIos217JsProgressPublicationSuppressed(enabled: boolean): boolean {
  if (!IOS217_DIAGNOSTIC_ENABLED) return false;
  suppressJsProgressPublication = !!enabled;
  return suppressJsProgressPublication;
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

function clearArmWatcher() {
  if (armWatcher) clearInterval(armWatcher);
  armWatcher = null;
  armedForPlayingAb = false;
}

function attachSampleCounters() {
  const globals = globalThis as CounterGlobal;
  previousPlaybackCounter = globals.__htCountPlayback;
  previousDiagnosticCounter = globals.__htCountIos217;
  previousTapCounter = globals.__htCountIos217Tap;
  globals.__htCountPlayback = countPlayback;
  globals.__htCountIos217 = countDiagnostic;
  globals.__htCountIos217Tap = countTap;
  setIos217HomeFabricSampleActive(true);
  setIos217FabricWorkloadSampleActive(true);
  // Investigation baseline: clipping ON (best measured full-playback config).
  setIos217HomeRemoveClippedSubviewsOverride(true);
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => core.tick(mode()), 100);
}

function beginPlayingAbSample() {
  if (!core.startSinglePhase("playing")) return false;
  clearArmWatcher();
  attachSampleCounters();
  return true;
}

function armHomeStart(fabricCompare: boolean) {
  stopIos217PlaybackSample();
  core.reset();
  if (mode() !== "paused") return false;
  lastReport = "";
  armedForHome = true;
  armedForFabricCompare = fabricCompare;
  const globals = globalThis as CounterGlobal;
  previousHomeStart = globals.__htStartIos217OnHome;
  globals.__htStartIos217OnHome = beginOnHome;
  return true;
}

export function startIos217PlaybackSample() {
  if (!IOS217_DIAGNOSTIC_ENABLED) return false;
  return armHomeStart(false);
}

/** PAUSED scroll → PLAY → PLAYING scroll → Stop. sequence_complete needs both phases. */
export function startIos217FabricCompareSample() {
  if (!IOS217_DIAGNOSTIC_ENABLED) return false;
  return armHomeStart(true);
}

/**
 * A/B playing sample. Prefer arming while PAUSED (UI is responsive).
 * Measurement starts automatically on the next transition to playing.
 * If already playing, starts immediately.
 */
export function startIos217PlayingAbSample() {
  if (!IOS217_DIAGNOSTIC_ENABLED) return false;
  stopIos217PlaybackSample();
  core.reset();
  lastReport = "";
  if (mode() === "playing") return beginPlayingAbSample();
  armedForPlayingAb = true;
  if (armWatcher) clearInterval(armWatcher);
  armWatcher = setInterval(() => {
    if (!armedForPlayingAb) {
      if (armWatcher) clearInterval(armWatcher);
      armWatcher = null;
      return;
    }
    if (mode() === "playing") beginPlayingAbSample();
  }, 250);
  return true;
}

function beginOnHome() {
  if (!armedForHome || mode() !== "paused") return;
  const started = armedForFabricCompare
    ? core.startPausedPlayingCompare()
    : core.start("paused");
  armedForFabricCompare = false;
  if (!started) return;
  armedForHome = false;
  const globals = globalThis as CounterGlobal;
  if (globals.__htStartIos217OnHome === beginOnHome) globals.__htStartIos217OnHome = previousHomeStart;
  previousHomeStart = undefined;
  attachSampleCounters();
}

export function stopIos217PlaybackSample() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  clearArmWatcher();
  setIos217HomeFabricSampleActive(false);
  setIos217FabricWorkloadSampleActive(false);
  const globals = globalThis as CounterGlobal;
  armedForHome = false;
  armedForFabricCompare = false;
  if (globals.__htStartIos217OnHome === beginOnHome) globals.__htStartIos217OnHome = previousHomeStart;
  previousHomeStart = undefined;
  if (globals.__htCountPlayback === countPlayback) globals.__htCountPlayback = previousPlaybackCounter;
  if (globals.__htCountIos217 === countDiagnostic) globals.__htCountIos217 = previousDiagnosticCounter;
  if (globals.__htCountIos217Tap === countTap) globals.__htCountIos217Tap = previousTapCounter;
  previousPlaybackCounter = undefined;
  previousDiagnosticCounter = undefined;
  previousTapCounter = undefined;
  if (core.snapshot().phases.length) {
    lastReport = [
      formatIos217PlaybackSample(core.stop()),
      `homeClipping=${describeIos217HomeClippingMode()}`,
      "family1=REVERT",
      formatIos217HomeRenderReasons(),
      formatIos217FabricWorkload(),
    ].join("\n");
  }
  return lastReport;
}

export function resetIos217PlaybackSample() {
  stopIos217PlaybackSample();
  core.reset();
  resetIos217HomeFabricAb();
  resetIos217FabricWorkload();
  setIos217HomeRemoveClippedSubviewsOverride(true);
  lastReport = "";
}

export function getIos217PlaybackSampleStatus() {
  const phase = armedForPlayingAb
    ? "armed A/B — press Play"
    : armedForHome
      ? armedForFabricCompare
        ? "armed Fabric compare — open Home"
        : "armed for Home"
      : core.phaseLabel();
  return {
    active: core.isActive() || armedForPlayingAb || armedForHome,
    phase,
    report: lastReport,
  };
}

export function countIos217Diagnostic(key: PlaybackSampleCounter) {
  if (IOS217_DIAGNOSTIC_ENABLED) core.count(key);
}

export function countIos217Render(surface: "home" | "appShell" | "miniPlayer" | "policy") {
  if (!IOS217_DIAGNOSTIC_ENABLED) return;
  const key: PlaybackSampleCounter =
    surface === "home"
      ? "homeRenders"
      : surface === "appShell"
        ? "appShellRenders"
        : surface === "miniPlayer"
          ? "miniPlayerRenders"
          : "policyRenders";
  core.count(key);
}

export function countIos217TabLatency(ms: number) {
  if (IOS217_DIAGNOSTIC_ENABLED) core.tapLatency(ms);
}
