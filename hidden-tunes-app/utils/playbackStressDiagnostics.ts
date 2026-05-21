import { logPerformanceEvent } from "./performanceLogs";

type TimingKind = "tap_to_audio_start" | "next_track_transition" | "pause_resume";

type PendingTiming = {
  kind: TimingKind;
  startedAt: number;
  songId?: string;
  source?: string;
};

type QueueControlAction =
  | "next"
  | "previous"
  | "shuffle_toggle"
  | "repeat_toggle"
  | "play_song";

const MAX_TIMING_SAMPLES = 24;
const RAPID_QUEUE_CONTROL_MS = 850;
const RAPID_RELOAD_WINDOW_MS = 12_000;
const RAPID_RELOAD_THRESHOLD = 6;
const ARTWORK_QUEUE_WARN = 48;
const DEFERRED_TASK_WARN = 10;
const IMAGE_FAILURE_WARN = 8;
const LARGE_QUEUE_WARN = 120;

const tapToAudioSamples: number[] = [];
const nextTrackSamples: number[] = [];
const pauseResumeSamples: number[] = [];

let pendingTiming: PendingTiming | null = null;
let playbackSessionStartedAt: number | null = null;
let lastPlaybackStartedAt = 0;

let artworkPrefetchAttempts = 0;
let artworkPrefetchSuccesses = 0;
let artworkPrefetchFailures = 0;
let artworkPrefetchQueued = 0;

let deferredTaskScheduled = 0;
let deferredTaskCompleted = 0;
let activeTimerCount = 0;

let audioReloadCount = 0;
let reloadWindowStartedAt = Date.now();

let lastQueueLength = 0;
let queueControlBurstCount = 0;
let lastQueueControlAt = 0;
let queueTortureWarnings = 0;

let offlineCacheStartupSuccesses = 0;
let snapshotFallbackUses = 0;
const emptyStatePreventionReasons = new Map<string, number>();

const stressWarnings: string[] = [];

function shouldTrack() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

function pushSample(samples: number[], value: number) {
  samples.push(value);
  if (samples.length > MAX_TIMING_SAMPLES) {
    samples.shift();
  }
}

function average(samples: number[]) {
  if (!samples.length) return 0;
  return Math.round(
    samples.reduce((total, value) => total + value, 0) / samples.length
  );
}

function warnOnce(code: string, details: Record<string, string | number | boolean | undefined> = {}) {
  if (!shouldTrack()) return;

  const message = `${code}:${JSON.stringify(details)}`;
  if (stressWarnings.includes(message)) return;

  stressWarnings.push(message);
  if (stressWarnings.length > 12) {
    stressWarnings.shift();
  }

  logPerformanceEvent("stress_warning", { code, ...details });
}

function notePlaybackSessionActivity() {
  if (!playbackSessionStartedAt) {
    playbackSessionStartedAt = Date.now();
  }
}

function checkReloadLoop() {
  const now = Date.now();

  if (now - reloadWindowStartedAt >= RAPID_RELOAD_WINDOW_MS) {
    audioReloadCount = 0;
    reloadWindowStartedAt = now;
  }

  audioReloadCount += 1;

  if (audioReloadCount >= RAPID_RELOAD_THRESHOLD) {
    warnOnce("rapid_playback_reload_loop", {
      reloadCount: audioReloadCount,
      windowMs: RAPID_RELOAD_WINDOW_MS,
    });
  }
}

export function beginTapToPlayTiming(songId?: string, source = "tap") {
  if (!shouldTrack()) return;

  pendingTiming = {
    kind: "tap_to_audio_start",
    startedAt: Date.now(),
    songId,
    source,
  };
}

export function beginNextTrackTransition(source = "next") {
  if (!shouldTrack()) return;

  pendingTiming = {
    kind: "next_track_transition",
    startedAt: Date.now(),
    source,
  };
}

export function beginPauseResumeTiming(source = "toggle") {
  if (!shouldTrack()) return;

  pendingTiming = {
    kind: "pause_resume",
    startedAt: Date.now(),
    source,
  };
}

export function completePendingPlaybackTiming(songId?: string, engine?: string) {
  if (!shouldTrack() || !pendingTiming) return;

  const durationMs = Date.now() - pendingTiming.startedAt;
  const kind = pendingTiming.kind;

  if (kind === "tap_to_audio_start") {
    pushSample(tapToAudioSamples, durationMs);
    logPerformanceEvent("tap_to_audio_start_ms", {
      durationMs,
      songId: songId || pendingTiming.songId,
      source: pendingTiming.source,
      engine,
    });
  } else if (kind === "next_track_transition") {
    pushSample(nextTrackSamples, durationMs);
    logPerformanceEvent("next_track_transition_ms", {
      durationMs,
      songId,
      source: pendingTiming.source,
      engine,
    });
  } else if (kind === "pause_resume") {
    pushSample(pauseResumeSamples, durationMs);
    logPerformanceEvent("pause_resume_ms", {
      durationMs,
      source: pendingTiming.source,
      engine,
    });
  }

  pendingTiming = null;
  notePlaybackSessionActivity();
  lastPlaybackStartedAt = Date.now();
}

export function cancelPendingPlaybackTiming(reason = "cancelled") {
  if (!shouldTrack() || !pendingTiming) return;

  logPerformanceEvent("playback_timing_cancelled", {
    kind: pendingTiming.kind,
    reason,
    waitedMs: Date.now() - pendingTiming.startedAt,
  });

  pendingTiming = null;
}

export function recordAudioReloadAttempt(details: Record<string, string | number | boolean | undefined> = {}) {
  if (!shouldTrack()) return;

  checkReloadLoop();
  logPerformanceEvent("audio_reload_attempt", details);
}

export function recordQueueControl(
  action: QueueControlAction,
  queueLength: number,
  details: Record<string, string | number | boolean | undefined> = {}
) {
  if (!shouldTrack()) return;

  const now = Date.now();
  lastQueueLength = queueLength;

  if (now - lastQueueControlAt <= RAPID_QUEUE_CONTROL_MS) {
    queueControlBurstCount += 1;
  } else {
    queueControlBurstCount = 1;
  }

  lastQueueControlAt = now;

  if (queueControlBurstCount >= 4) {
    queueTortureWarnings += 1;
    warnOnce("rapid_queue_controls", {
      action,
      burstCount: queueControlBurstCount,
      queueLength,
    });
  }

  if (queueLength >= LARGE_QUEUE_WARN) {
    warnOnce("large_queue_active", { queueLength, action });
  }

  logPerformanceEvent("queue_control", {
    action,
    queueLength,
    burstCount: queueControlBurstCount,
    ...details,
  });
}

export function updateActiveQueueLength(queueLength: number) {
  if (!shouldTrack()) return;
  lastQueueLength = queueLength;

  if (queueLength >= LARGE_QUEUE_WARN) {
    warnOnce("large_queue_active", { queueLength });
  }
}

export function recordArtworkPrefetchQueued(count: number) {
  if (!shouldTrack()) return;

  artworkPrefetchQueued += count;

  if (artworkPrefetchQueued >= ARTWORK_QUEUE_WARN) {
    warnOnce("artwork_prefetch_queue_large", {
      queued: artworkPrefetchQueued,
      loaded: artworkPrefetchSuccesses,
    });
  }
}

export function recordArtworkPrefetchAttempt(count: number) {
  if (!shouldTrack()) return;
  artworkPrefetchAttempts += count;
}

export function recordArtworkPrefetchSuccess(count: number) {
  if (!shouldTrack()) return;
  artworkPrefetchSuccesses += count;
}

export function recordArtworkPrefetchFailure(count: number) {
  if (!shouldTrack()) return;

  artworkPrefetchFailures += count;

  if (artworkPrefetchFailures >= IMAGE_FAILURE_WARN) {
    warnOnce("repeated_image_prefetch_failures", {
      failures: artworkPrefetchFailures,
      attempts: artworkPrefetchAttempts,
    });
  }
}

export function recordDeferredTaskScheduled() {
  if (!shouldTrack()) return;

  deferredTaskScheduled += 1;

  const activeDeferred = deferredTaskScheduled - deferredTaskCompleted;

  if (activeDeferred >= DEFERRED_TASK_WARN) {
    warnOnce("too_many_deferred_tasks", {
      activeDeferred,
      scheduled: deferredTaskScheduled,
      completed: deferredTaskCompleted,
    });
  }
}

export function recordDeferredTaskCompleted() {
  if (!shouldTrack()) return;
  deferredTaskCompleted += 1;
}

export function registerActiveTimer(label: string) {
  if (!shouldTrack()) return;

  activeTimerCount += 1;
  logPerformanceEvent("active_timer_registered", {
    label,
    activeTimerCount,
  });
}

export function unregisterActiveTimer(label: string) {
  if (!shouldTrack()) return;

  activeTimerCount = Math.max(0, activeTimerCount - 1);
  logPerformanceEvent("active_timer_unregistered", {
    label,
    activeTimerCount,
  });
}

export function recordOfflineCacheStartup(screen: string, itemCount: number) {
  if (!shouldTrack()) return;

  offlineCacheStartupSuccesses += 1;

  logPerformanceEvent("offline_cache_startup_success", {
    screen,
    itemCount,
    total: offlineCacheStartupSuccesses,
  });
}

export function recordSnapshotFallbackUsage(screen: string, itemCount: number) {
  if (!shouldTrack()) return;

  snapshotFallbackUses += 1;

  logPerformanceEvent("snapshot_fallback_used", {
    screen,
    itemCount,
    total: snapshotFallbackUses,
  });
}

export function recordEmptyStatePrevented(
  screen: string,
  reason: string,
  itemCount = 0
) {
  if (!shouldTrack()) return;

  emptyStatePreventionReasons.set(
    reason,
    (emptyStatePreventionReasons.get(reason) || 0) + 1
  );

  logPerformanceEvent("empty_state_prevented", {
    screen,
    reason,
    itemCount,
    count: emptyStatePreventionReasons.get(reason),
  });
}

export function getPlaybackStressDiagnostics() {
  const sessionDurationMs = playbackSessionStartedAt
    ? Date.now() - playbackSessionStartedAt
    : 0;

  return {
    avgTapToAudioStartMs: average(tapToAudioSamples),
    avgNextTrackTransitionMs: average(nextTrackSamples),
    avgPauseResumeMs: average(pauseResumeSamples),
    tapToAudioSampleCount: tapToAudioSamples.length,
    nextTrackSampleCount: nextTrackSamples.length,
    pauseResumeSampleCount: pauseResumeSamples.length,
    lastTapToAudioMs: tapToAudioSamples[tapToAudioSamples.length - 1] || 0,
    lastNextTrackMs: nextTrackSamples[nextTrackSamples.length - 1] || 0,
    lastPauseResumeMs: pauseResumeSamples[pauseResumeSamples.length - 1] || 0,
    playbackSessionDurationMs: sessionDurationMs,
    artworkPrefetchAttempts,
    artworkPrefetchSuccesses,
    artworkPrefetchFailures,
    artworkPrefetchQueued,
    deferredTaskScheduled,
    deferredTaskCompleted,
    activeDeferredTasks: Math.max(0, deferredTaskScheduled - deferredTaskCompleted),
    activeTimerCount,
    audioReloadCountWindow: audioReloadCount,
    queueLength: lastQueueLength,
    queueTortureWarnings,
    queueControlBurstCount,
    offlineCacheStartupSuccesses,
    snapshotFallbackUses,
    emptyStatePreventionReasons: Object.fromEntries(emptyStatePreventionReasons.entries()),
    stressWarnings: [...stressWarnings],
    pendingTimingKind: pendingTiming?.kind || null,
    lastPlaybackStartedAt,
  };
}

export function resetPlaybackStressDiagnostics() {
  tapToAudioSamples.length = 0;
  nextTrackSamples.length = 0;
  pauseResumeSamples.length = 0;
  pendingTiming = null;
  playbackSessionStartedAt = null;
  lastPlaybackStartedAt = 0;
  artworkPrefetchAttempts = 0;
  artworkPrefetchSuccesses = 0;
  artworkPrefetchFailures = 0;
  artworkPrefetchQueued = 0;
  deferredTaskScheduled = 0;
  deferredTaskCompleted = 0;
  activeTimerCount = 0;
  audioReloadCount = 0;
  reloadWindowStartedAt = Date.now();
  lastQueueLength = 0;
  queueControlBurstCount = 0;
  lastQueueControlAt = 0;
  queueTortureWarnings = 0;
  offlineCacheStartupSuccesses = 0;
  snapshotFallbackUses = 0;
  emptyStatePreventionReasons.clear();
  stressWarnings.length = 0;
}
