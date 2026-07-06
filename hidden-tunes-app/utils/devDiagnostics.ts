/**
 * Central dev diagnostics toggles (Phase 2F-A).
 * Flip ENABLE_HEAVY_PERF_DIAGNOSTICS to true for full perf verification.
 */

/** Essential perf logs: screen_ready, tap timing, slow API. Off by default to reduce JS churn. */
export const ENABLE_BASIC_PERF_DIAGNOSTICS = false;

/** RAF long-task monitor, scroll jank, render probes, stress logs, perf summaries. */
export const ENABLE_HEAVY_PERF_DIAGNOSTICS = false;

/**
 * TEMPORARY runtime bottleneck instrumentation (RNTP churn, AppState, renders, prefetch).
 * Set false or remove utils/runtimeInstrumentation.ts when diagnosis is complete.
 */
export const ENABLE_RUNTIME_INSTRUMENTATION = false;

export function isDevEnvironment() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function isBasicPerfDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_BASIC_PERF_DIAGNOSTICS;
}

export function isHeavyPerfDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_HEAVY_PERF_DIAGNOSTICS;
}

export function isRuntimeInstrumentationEnabled() {
  return isDevEnvironment() && ENABLE_RUNTIME_INSTRUMENTATION;
}

/** Verbose playback/progress/queue logs — opt-in only (runtime or heavy perf flags). */
export function isVerbosePlaybackDiagnosticsEnabled() {
  return isRuntimeInstrumentationEnabled() || isHeavyPerfDiagnosticsEnabled();
}
