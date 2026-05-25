/**
 * Central dev diagnostics toggles (Phase 2F-A).
 * Flip ENABLE_HEAVY_PERF_DIAGNOSTICS to true for full perf verification.
 */

/** Essential perf logs: screen_ready, tap timing, slow API, errors. */
export const ENABLE_BASIC_PERF_DIAGNOSTICS = true;

/** RAF long-task monitor, scroll jank, render probes, stress logs, perf summaries. */
export const ENABLE_HEAVY_PERF_DIAGNOSTICS = false;

export function isDevEnvironment() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

export function isBasicPerfDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_BASIC_PERF_DIAGNOSTICS;
}

export function isHeavyPerfDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_HEAVY_PERF_DIAGNOSTICS;
}
