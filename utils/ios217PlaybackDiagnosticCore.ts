// Temporary 217-only in-memory pause/play measurement. No storage or reporting.
export type PlaybackSampleMode = "paused" | "playing";
export type PlaybackSampleCounter =
  | "homeRenders" | "appShellRenders" | "miniPlayerRenders" | "policyRenders"
  | "playerRenders" | "songRowRenders"
  | "positionWrites" | "playingWrites" | "trackWrites" | "bufferWrites"
  | "durationWrites" | "queueWrites" | "progressCallbacks"
  | "progressApplied" | "policyAttempts" | "policySuccesses"
  | "policyFailures" | "policyTransitions";

export type PlaybackSampleMetrics = {
  durationMs: number;
  gap50: number; gap100: number; gap250: number; gap500: number; gap1000: number; gap2000: number;
  maxGapMs: number; maxTransitionGapMs: number;
  tapCount: number; tapP50Ms: number | null; tapP95Ms: number | null; tapP99Ms: number | null;
  tapMaxMs: number | null; tapSamplesDropped: number;
  nativeTapTimestamps: number; jsTouchFallbacks: number;
  counters: Record<PlaybackSampleCounter, number>;
};

type MutableMetrics = PlaybackSampleMetrics & { tapLatencies: number[] };
type Phase = { mode: PlaybackSampleMode; startedAt: number; endedAt: number | null; metrics: MutableMetrics };
const EXPECTED: PlaybackSampleMode[] = ["paused", "playing", "paused", "playing"];
const COUNTERS: PlaybackSampleCounter[] = [
  "homeRenders", "appShellRenders", "miniPlayerRenders", "policyRenders",
  "playerRenders", "songRowRenders",
  "positionWrites", "playingWrites", "trackWrites", "bufferWrites", "durationWrites",
  "queueWrites", "progressCallbacks", "progressApplied", "policyAttempts",
  "policySuccesses", "policyFailures", "policyTransitions",
];
const MAX_TAP_SAMPLES = 512;

function blank(): MutableMetrics {
  const counters = {} as Record<PlaybackSampleCounter, number>;
  for (const key of COUNTERS) counters[key] = 0;
  return {
    durationMs: 0, gap50: 0, gap100: 0, gap250: 0, gap500: 0, gap1000: 0, gap2000: 0,
    maxGapMs: 0, maxTransitionGapMs: 0, tapCount: 0, tapP50Ms: null,
    tapP95Ms: null, tapP99Ms: null, tapMaxMs: null, tapSamplesDropped: 0,
    nativeTapTimestamps: 0, jsTouchFallbacks: 0, counters,
    tapLatencies: [],
  };
}

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.ceil(sorted.length * fraction) - 1]);
}

function finalize(metrics: MutableMetrics): PlaybackSampleMetrics {
  const sorted = [...metrics.tapLatencies].sort((a, b) => a - b);
  const { tapLatencies: _tapLatencies, ...rest } = metrics;
  return {
    ...rest,
    tapP50Ms: percentile(sorted, 0.5),
    tapP95Ms: percentile(sorted, 0.95),
    tapP99Ms: percentile(sorted, 0.99),
    tapMaxMs: sorted.length ? Math.round(sorted[sorted.length - 1]) : null,
  };
}

export class Ios217PlaybackDiagnosticCore {
  private expectedSequence: PlaybackSampleMode[] = EXPECTED;
  private phases: Phase[] = [];
  private active = false;
  private lastTickAt = 0;
  private invalidSequence = false;
  private singlePhaseLocked = false;
  constructor(private readonly now: () => number = () => globalThis.performance.now()) {}

  start(mode: PlaybackSampleMode): boolean {
    if (mode !== "paused") return false;
    const at = this.now();
    this.phases = [{ mode, startedAt: at, endedAt: null, metrics: blank() }];
    this.lastTickAt = at;
    this.invalidSequence = false;
    this.singlePhaseLocked = false;
    this.expectedSequence = EXPECTED;
    this.active = true;
    return true;
  }

  /** PAUSED → PLAYING only. sequence_complete after both phases (Fabric compare). */
  startPausedPlayingCompare(): boolean {
    if (!this.start("paused")) return false;
    this.expectedSequence = ["paused", "playing"];
    return true;
  }

  /** One-phase A/B sample (e.g. playing-only progress isolation). No PAUSE/PLAY sequence. */
  startSinglePhase(mode: PlaybackSampleMode): boolean {
    const at = this.now();
    this.phases = [{ mode, startedAt: at, endedAt: null, metrics: blank() }];
    this.lastTickAt = at;
    this.invalidSequence = false;
    this.singlePhaseLocked = true;
    this.expectedSequence = [mode];
    this.active = true;
    return true;
  }

  isActive() { return this.active; }
  reset() {
    this.active = false;
    this.phases = [];
    this.lastTickAt = 0;
    this.invalidSequence = false;
    this.singlePhaseLocked = false;
    this.expectedSequence = EXPECTED;
  }
  phaseLabel() {
    if (!this.phases.length) return "not started";
    const last = this.phases[this.phases.length - 1];
    if (!this.active) return "stopped";
    if (this.singlePhaseLocked) return `A/B ${last.mode}`;
    const total = this.expectedSequence.length;
    return `${this.phases.length}/${total} ${last.mode}`;
  }

  observeMode(mode: PlaybackSampleMode) {
    if (!this.active) return;
    if (this.singlePhaseLocked) return;
    const current = this.phases[this.phases.length - 1];
    if (mode === current.mode) return;
    const at = this.now();
    current.endedAt = at;
    current.metrics.durationMs = Math.max(0, Math.round(at - current.startedAt));
    const next = this.expectedSequence[this.phases.length];
    if (!next) { this.active = false; return; }
    if (mode !== next) this.invalidSequence = true;
    this.phases.push({ mode, startedAt: at, endedAt: null, metrics: blank() });
    // A delayed PLAY/PAUSE transition cannot be assigned to either interval.
    const transitionGap = Math.max(0, at - this.lastTickAt - 100);
    current.metrics.maxTransitionGapMs = Math.max(current.metrics.maxTransitionGapMs, Math.round(transitionGap));
    this.lastTickAt = at;
  }

  tick(mode: PlaybackSampleMode) {
    if (!this.active) return;
    const before = this.phases.length;
    this.observeMode(mode);
    if (!this.active || this.phases.length !== before) return;
    const at = this.now();
    const excess = Math.max(0, at - this.lastTickAt - 100);
    this.lastTickAt = at;
    const metrics = this.phases[this.phases.length - 1].metrics;
    metrics.maxGapMs = Math.max(metrics.maxGapMs, Math.round(excess));
    if (excess > 50) metrics.gap50++;
    if (excess > 100) metrics.gap100++;
    if (excess > 250) metrics.gap250++;
    if (excess > 500) metrics.gap500++;
    if (excess > 1000) metrics.gap1000++;
    if (excess > 2000) metrics.gap2000++;
  }

  count(key: PlaybackSampleCounter) {
    if (!this.active) return;
    this.phases[this.phases.length - 1].metrics.counters[key]++;
  }

  tapLatency(ms: number, nativeTimestamp = false) {
    if (!this.active || !Number.isFinite(ms) || ms < 0) return;
    const metrics = this.phases[this.phases.length - 1].metrics;
    metrics.tapCount++;
    if (nativeTimestamp) metrics.nativeTapTimestamps++;
    else metrics.jsTouchFallbacks++;
    if (metrics.tapLatencies.length < MAX_TAP_SAMPLES) metrics.tapLatencies.push(ms);
    else metrics.tapSamplesDropped++;
  }

  stop() {
    if (this.active) {
      const current = this.phases[this.phases.length - 1];
      const at = this.now();
      current.endedAt = at;
      current.metrics.durationMs = Math.max(0, Math.round(at - current.startedAt));
      this.active = false;
    }
    return this.snapshot();
  }

  snapshot() {
    const aggregate = (mode: PlaybackSampleMode) => {
      const total = blank();
      for (const phase of this.phases) {
        if (phase.mode !== mode) continue;
        const m = phase.metrics;
        total.durationMs += m.durationMs || (phase.endedAt === null ? Math.max(0, Math.round(this.now() - phase.startedAt)) : 0);
        total.gap50 += m.gap50; total.gap100 += m.gap100; total.gap250 += m.gap250;
        total.gap500 += m.gap500; total.gap1000 += m.gap1000; total.gap2000 += m.gap2000;
        total.maxGapMs = Math.max(total.maxGapMs, m.maxGapMs);
        total.maxTransitionGapMs = Math.max(total.maxTransitionGapMs, m.maxTransitionGapMs);
        total.tapCount += m.tapCount;
        total.nativeTapTimestamps += m.nativeTapTimestamps;
        total.jsTouchFallbacks += m.jsTouchFallbacks;
        total.tapSamplesDropped += m.tapSamplesDropped;
        for (const latency of m.tapLatencies) {
          if (total.tapLatencies.length < MAX_TAP_SAMPLES) total.tapLatencies.push(latency);
          else total.tapSamplesDropped++;
        }
        for (const key of COUNTERS) total.counters[key] += m.counters[key];
      }
      return finalize(total);
    };
    return {
      complete: this.phases.length === this.expectedSequence.length && !this.invalidSequence,
      paused: aggregate("paused"),
      playing: aggregate("playing"),
      phases: this.phases.map((phase) => ({
        mode: phase.mode,
        metrics: finalize({ ...phase.metrics, durationMs: phase.metrics.durationMs ||
          (phase.endedAt === null ? Math.max(0, Math.round(this.now() - phase.startedAt)) : 0) }),
      })),
    };
  }

}

export function formatIos217PlaybackSample(result: ReturnType<Ios217PlaybackDiagnosticCore["snapshot"]>): string {
  const lines = ["Hidden Tunes 217 pause/play diagnostic", "runtime=1.0.3-dev.1.0.217",
    "gap=excess over 100ms JS heartbeat; tap=event timestamp to handler when clocks match, else JS onPressIn to handler",
    `sequence_complete=${result.complete}`];
  for (const mode of ["paused", "playing"] as const) {
    const m = result[mode];
    lines.push(`${mode.toUpperCase()} TOTAL duration=${Math.round(m.durationMs / 1000)}s gaps>50=${m.gap50} >100=${m.gap100} >250=${m.gap250} >500=${m.gap500} >1000=${m.gap1000} >2000=${m.gap2000} max=${m.maxGapMs}ms transitionMax=${m.maxTransitionGapMs}ms`);
    lines.push(`taps n=${m.tapCount} p50=${m.tapP50Ms ?? "n/a"}ms p95=${m.tapP95Ms ?? "n/a"}ms p99=${m.tapP99Ms ?? "n/a"}ms max=${m.tapMaxMs ?? "n/a"}ms nativeClock=${m.nativeTapTimestamps} jsFallback=${m.jsTouchFallbacks} dropped=${m.tapSamplesDropped}`);
    lines.push(COUNTERS.map((key) => `${key}=${m.counters[key]}`).join(" "));
  }
  for (const [index, phase] of result.phases.entries()) {
    const m = phase.metrics;
    lines.push(`${index + 1} ${phase.mode.toUpperCase()} duration=${Math.round(m.durationMs / 1000)}s`);
    lines.push(`gaps >50=${m.gap50} >100=${m.gap100} >250=${m.gap250} >500=${m.gap500} >1000=${m.gap1000} >2000=${m.gap2000} max=${m.maxGapMs}ms transitionMax=${m.maxTransitionGapMs}ms`);
    lines.push(`taps n=${m.tapCount} p50=${m.tapP50Ms ?? "n/a"}ms p95=${m.tapP95Ms ?? "n/a"}ms p99=${m.tapP99Ms ?? "n/a"}ms max=${m.tapMaxMs ?? "n/a"}ms nativeClock=${m.nativeTapTimestamps} jsFallback=${m.jsTouchFallbacks} dropped=${m.tapSamplesDropped}`);
    lines.push(COUNTERS.map((key) => `${key}=${m.counters[key]}`).join(" "));
  }
  lines.push("network=unavailable (no safe common wrapper)");
  return lines.join("\n");
}
