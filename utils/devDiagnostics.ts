/**
 * Central dev diagnostics toggles (Phase 2F-A).
 * Flip ENABLE_HEAVY_PERF_DIAGNOSTICS to true for full perf verification.
 */

/** Essential perf logs: screen_ready, tap timing, slow API. Off by default to reduce JS churn. */
export const ENABLE_BASIC_PERF_DIAGNOSTICS = false;

/** RAF long-task monitor, scroll jank, render probes, stress logs, perf summaries. */
export const ENABLE_HEAVY_PERF_DIAGNOSTICS = false;

/** Runtime bottleneck instrumentation; enable only during targeted diagnosis. */
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

/** Mature discovery category counts — dev-only, flip to true during mature QA. */
export const ENABLE_MATURE_DISCOVERY_DIAGNOSTICS = false;

/** Discovery request/render timing — dev-only, flip during heat QA. */
export const ENABLE_DISCOVERY_PERF_DIAGNOSTICS = false;

/**
 * Audiobooks / Podcasts / Motivationals / Lectures browse+queue heat diagnostics.
 * Off by default — flip true only during content thermal QA ([HTContentPerformance]).
 */
export const ENABLE_CONTENT_PERF_DIAGNOSTICS = false;

export function isDiscoveryPerfDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_DISCOVERY_PERF_DIAGNOSTICS;
}

export function isContentPerfDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_CONTENT_PERF_DIAGNOSTICS;
}

export function isMatureDiscoveryDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_MATURE_DISCOVERY_DIAGNOSTICS;
}

/** Radio discovery fetch/render ring buffer — dev + heavy perf flag only. */
export function isRadioDiscoveryDiagnosticsEnabled() {
  return isDevEnvironment() && ENABLE_HEAVY_PERF_DIAGNOSTICS;
}

/** Verbose playback/progress/queue logs — opt-in only (heavy perf flag). */
export function isVerbosePlaybackDiagnosticsEnabled() {
  // Do not couple to ENABLE_RUNTIME_INSTRUMENTATION — that amplified lockscreen/TV
  // diag spam during global lag diagnosis and polluted the JS thread.
  return isHeavyPerfDiagnosticsEnabled();
}

/** Persist lockscreen/critical diagnostic rings to AsyncStorage — heavy perf only. */
export function isDiagnosticsAsyncStorageEnabled() {
  return isDevEnvironment() && ENABLE_HEAVY_PERF_DIAGNOSTICS;
}

/** Verbose lockscreen event ring buffer — dev-only unless heavy perf is on. */
export function isLockscreenDiagnosticsLoggingEnabled() {
  return isDiagnosticsAsyncStorageEnabled();
}

export function isPlaybackFailureEvent(event: string) {
  return /fail|error|unexpected|unavailable|blocked|denied|timeout|crash/i.test(
    event
  );
}
