/**
 * TEMPORARY runtime instrumentation — remove by disabling ENABLE_RUNTIME_INSTRUMENTATION.
 * Logs hard evidence for playback/UI churn, listener duplication, and JS stalls.
 */

import { useLayoutEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { isRuntimeInstrumentationEnabled } from "./devDiagnostics";
import { getImagePrefetchStatus } from "./imagePreloader";

const LOG_TAG = "[HiddenTunes:runtime]";

const SUMMARY_INTERVAL_MS = 60_000;
const JS_STALL_THRESHOLD_MS = 100;
const DUPLICATE_WINDOW_MS = 8_000;

type CounterBucket = {
  total: number;
  windowStart: number;
  windowCount: number;
};

type ListenerRecord = {
  type: string;
  instanceId: string;
  registeredAt: number;
};

const counters = {
  configureTrackPlayerOptions: createBucket(),
  updateTrackPlayerProgressInterval: createBucket(),
  bridgeSetProgressInterval: createBucket(),
  configureAudio: createBucket(),
  applyProgressUpdateInterval: createBucket(),
  playbackProgressNative: createBucket(),
  playbackProgressExpo: createBucket(),
  playbackReactStateUpdates: createBucket(),
  playbackStatusSpam: createBucket(),
  appStateTransitions: createBucket(),
  duplicateAppStateTransitions: createBucket(),
  queuePersistWrites: createBucket(),
  artworkPrefetchAttempts: createBucket(),
  artworkPrefetchDuplicates: createBucket(),
  jsStallsOver100ms: createBucket(),
  screenRenders: new Map<string, CounterBucket>(),
};

const listenerRegistry = new Map<string, ListenerRecord>();
const activeTimers = new Map<string, number>();
const prefetchUrlCounts = new Map<string, number>();

let lastConfigureOptionsKey = "";
let lastConfigureOptionsAt = 0;
let duplicateConfigureOptions = 0;

let lastAppStateKey = "";
let lastAppStateAt = 0;

let summaryIntervalId: ReturnType<typeof setInterval> | null = null;
let jsMonitorFrameId: number | null = null;
let jsMonitorLastFrameAt = 0;
let instrumentationStarted = false;
let bridgeSubscriptionCount = 0;
let remoteHandlerAttachCount = 0;

function createBucket(): CounterBucket {
  return { total: 0, windowStart: Date.now(), windowCount: 0 };
}

function bump(bucket: CounterBucket, amount = 1) {
  const now = Date.now();
  if (now - bucket.windowStart >= SUMMARY_INTERVAL_MS) {
    bucket.windowStart = now;
    bucket.windowCount = 0;
  }
  bucket.total += amount;
  bucket.windowCount += amount;
}

function logEvent(event: string, details: Record<string, unknown> = {}) {
  if (!isRuntimeInstrumentationEnabled()) return;
  console.log(LOG_TAG, event, { at: Date.now(), ...details });
}

function logWarn(event: string, details: Record<string, unknown> = {}) {
  if (!isRuntimeInstrumentationEnabled()) return;
  console.warn(LOG_TAG, event, { at: Date.now(), ...details });
}

function perMinute(bucket: CounterBucket) {
  const elapsedMs = Math.max(1, Date.now() - bucket.windowStart);
  return Math.round((bucket.windowCount / elapsedMs) * 60_000);
}

function getScreenRenderTotals() {
  const rerenderCounts: Record<string, number> = {};
  let total = 0;

  counters.screenRenders.forEach((bucket, screen) => {
    rerenderCounts[screen] = bucket.windowCount;
    total += bucket.windowCount;
  });

  return { rerenderCounts, total };
}

export function recordConfigureTrackPlayerOptions(
  intervalSeconds: number,
  reason: string
) {
  if (!isRuntimeInstrumentationEnabled()) return;

  bump(counters.configureTrackPlayerOptions);
  const key = `${intervalSeconds}:${reason}`;
  const now = Date.now();

  if (key === lastConfigureOptionsKey && now - lastConfigureOptionsAt < DUPLICATE_WINDOW_MS) {
    duplicateConfigureOptions += 1;
    logWarn("duplicate_configure_track_player_options", {
      intervalSeconds,
      reason,
      duplicateConfigureOptions,
      msSinceLast: now - lastConfigureOptionsAt,
    });
  }

  lastConfigureOptionsKey = key;
  lastConfigureOptionsAt = now;

  logEvent("configure_track_player_options", { intervalSeconds, reason });
}

export function recordUpdateTrackPlayerProgressInterval(
  intervalSeconds: number,
  reason: string
) {
  if (!isRuntimeInstrumentationEnabled()) return;

  bump(counters.updateTrackPlayerProgressInterval);
  logEvent("update_track_player_progress_interval", { intervalSeconds, reason });
}

export function recordBridgeSetProgressInterval(
  appState: AppStateStatus,
  intervalSeconds: number
) {
  if (!isRuntimeInstrumentationEnabled()) return;

  bump(counters.bridgeSetProgressInterval);
  logEvent("bridge_set_progress_interval", { appState, intervalSeconds });
}

export function recordBackgroundChurnSkipped(reason: string) {
  if (!isRuntimeInstrumentationEnabled()) return;
  logEvent("background_churn_skipped", { reason, appState: AppState.currentState });
}

export function recordConfigureAudioCall(reason: string) {
  if (!isRuntimeInstrumentationEnabled()) return;

  bump(counters.configureAudio);
  logEvent("configure_audio", { reason, appState: AppState.currentState });
}

export function recordApplyProgressUpdateIntervalCall(reason: string) {
  if (!isRuntimeInstrumentationEnabled()) return;

  bump(counters.applyProgressUpdateInterval);
  logEvent("apply_progress_update_interval", { reason, appState: AppState.currentState });
}

export function recordAppStateTransition(
  previousState: AppStateStatus,
  nextState: AppStateStatus
) {
  if (!isRuntimeInstrumentationEnabled()) return;

  bump(counters.appStateTransitions);

  const key = `${previousState}->${nextState}`;
  const now = Date.now();

  if (key === lastAppStateKey && now - lastAppStateAt < 400) {
    bump(counters.duplicateAppStateTransitions);
    logWarn("duplicate_app_state_transition", {
      transition: key,
      msSinceLast: now - lastAppStateAt,
    });
  }

  lastAppStateKey = key;
  lastAppStateAt = now;

  logEvent("app_state_transition", { previousState, nextState });
}

export function recordPlaybackProgressUpdate(
  engine: "track_player" | "hidden_audio" | "native_audio",
  appState: AppStateStatus
) {
  if (!isRuntimeInstrumentationEnabled()) return;

  const bucket =
    engine === "track_player"
      ? counters.playbackProgressNative
      : counters.playbackProgressExpo;

  bump(bucket);

  if (appState !== "active") {
    logEvent("playback_progress_while_not_active", {
      engine,
      appState,
      perMinute: perMinute(bucket),
    });
  }
}

export function recordPlaybackReactStateUpdate(kind: string) {
  if (!isRuntimeInstrumentationEnabled()) return;
  bump(counters.playbackReactStateUpdates);
  bump(counters.playbackStatusSpam);
  logEvent("playback_react_state_update", { kind, appState: AppState.currentState });
}

export function recordListenerRegister(type: string, instanceId: string) {
  if (!isRuntimeInstrumentationEnabled()) return;

  const key = `${type}:${instanceId}`;

  if (listenerRegistry.has(key)) {
    logWarn("duplicate_listener_registration", { type, instanceId });
  }

  listenerRegistry.set(key, {
    type,
    instanceId,
    registeredAt: Date.now(),
  });

  logEvent("listener_registered", {
    type,
    instanceId,
    activeListeners: listenerRegistry.size,
  });
}

export function recordListenerUnregister(type: string, instanceId: string) {
  if (!isRuntimeInstrumentationEnabled()) return;

  const key = `${type}:${instanceId}`;
  listenerRegistry.delete(key);

  logEvent("listener_unregistered", {
    type,
    instanceId,
    activeListeners: listenerRegistry.size,
  });
}

export function recordBridgeSubscriptionCreated() {
  if (!isRuntimeInstrumentationEnabled()) return;

  bridgeSubscriptionCount += 1;
  logEvent("bridge_subscription_created", {
    bridgeSubscriptionCount,
  });
}

export function recordBridgeSubscriptionDisposed() {
  if (!isRuntimeInstrumentationEnabled()) return;

  bridgeSubscriptionCount = Math.max(0, bridgeSubscriptionCount - 1);
  logEvent("bridge_subscription_disposed", {
    bridgeSubscriptionCount,
  });
}

export function recordRemoteHandlersAttached(context: string, count: number) {
  if (!isRuntimeInstrumentationEnabled()) return;

  remoteHandlerAttachCount += 1;
  logEvent("remote_handlers_attached", {
    context,
    handlerCount: count,
    attachGenerations: remoteHandlerAttachCount,
  });
}

export function recordScreenRender(screen: string) {
  if (!isRuntimeInstrumentationEnabled()) return;

  let bucket = counters.screenRenders.get(screen);
  if (!bucket) {
    bucket = createBucket();
    counters.screenRenders.set(screen, bucket);
  }

  bump(bucket);
}

export function recordArtworkPrefetch(url: string, source: string) {
  if (!isRuntimeInstrumentationEnabled()) return;

  bump(counters.artworkPrefetchAttempts);

  const hits = (prefetchUrlCounts.get(url) || 0) + 1;
  prefetchUrlCounts.set(url, hits);

  if (hits > 1) {
    bump(counters.artworkPrefetchDuplicates);
    logWarn("duplicate_artwork_prefetch", {
      url: url.slice(0, 96),
      source,
      hits,
      appState: AppState.currentState,
    });
  }

  logEvent("artwork_prefetch", {
    source,
    appState: AppState.currentState,
    url: url.slice(0, 96),
  });
}

export function recordQueuePersistWrite(queueLength: number, reason: string) {
  if (!isRuntimeInstrumentationEnabled()) return;

  bump(counters.queuePersistWrites);

  if (queueLength >= 80) {
    logWarn("large_queue_persist", { queueLength, reason });
  }

  logEvent("queue_persist_write", { queueLength, reason });
}

export function registerRuntimeTimer(label: string) {
  if (!isRuntimeInstrumentationEnabled()) return;
  activeTimers.set(label, (activeTimers.get(label) || 0) + 1);
}

export function unregisterRuntimeTimer(label: string) {
  if (!isRuntimeInstrumentationEnabled()) return;

  const next = (activeTimers.get(label) || 0) - 1;
  if (next <= 0) {
    activeTimers.delete(label);
    return;
  }

  activeTimers.set(label, next);
}

export function recordJsStall(durationMs: number, source: string) {
  if (!isRuntimeInstrumentationEnabled()) return;
  if (durationMs < JS_STALL_THRESHOLD_MS) return;

  bump(counters.jsStallsOver100ms);
  logWarn("js_stall", {
    durationMs: Math.round(durationMs),
    source,
    appState: AppState.currentState,
    hint: "UI taps may feel delayed after this",
  });
}

function printRuntimeSummary() {
  if (!isRuntimeInstrumentationEnabled()) return;

  const { rerenderCounts, total: rerendersWindow } = getScreenRenderTotals();
  const imagePrefetch = getImagePrefetchStatus();

  const listenerTypes: Record<string, number> = {};
  listenerRegistry.forEach((record) => {
    listenerTypes[record.type] = (listenerTypes[record.type] || 0) + 1;
  });

  const activeTimerSummary = Object.fromEntries(activeTimers.entries());

  console.log(LOG_TAG, "summary_60s", {
    at: Date.now(),
    appState: AppState.currentState,
    updateOptions: {
      total: counters.configureTrackPlayerOptions.total,
      perMin: perMinute(counters.configureTrackPlayerOptions),
      duplicateSameValue: duplicateConfigureOptions,
    },
    progressInterval: {
      updateTrackPlayerProgressInterval: perMinute(
        counters.updateTrackPlayerProgressInterval
      ),
      bridgeSetProgressInterval: perMinute(counters.bridgeSetProgressInterval),
      applyProgressUpdateInterval: perMinute(counters.applyProgressUpdateInterval),
    },
    audioSession: {
      configureAudioPerMin: perMinute(counters.configureAudio),
    },
    playback: {
      progressNativePerMin: perMinute(counters.playbackProgressNative),
      progressExpoPerMin: perMinute(counters.playbackProgressExpo),
      reactStateUpdatesPerMin: perMinute(counters.playbackReactStateUpdates),
      statusSpamPerMin: perMinute(counters.playbackStatusSpam),
    },
    appStateMetrics: {
      transitionsPerMin: perMinute(counters.appStateTransitions),
      duplicateTransitionsPerMin: perMinute(counters.duplicateAppStateTransitions),
    },
    listeners: {
      active: listenerRegistry.size,
      byType: listenerTypes,
      bridgeSubscriptions: bridgeSubscriptionCount,
      remoteHandlerAttachGenerations: remoteHandlerAttachCount,
    },
    renders: {
      perMinTotal: rerendersWindow,
      byScreen: rerenderCounts,
    },
    prefetch: {
      attemptsPerMin: perMinute(counters.artworkPrefetchAttempts),
      duplicateUrlsPerMin: perMinute(counters.artworkPrefetchDuplicates),
      trackedUniqueUrls: prefetchUrlCounts.size,
      imageCacheLoadedCount: imagePrefetch.loadedCount,
    },
    queue: {
      persistWritesPerMin: perMinute(counters.queuePersistWrites),
    },
    js: {
      stallsOver100msPerMin: perMinute(counters.jsStallsOver100ms),
    },
    timers: activeTimerSummary,
  });
}

function startJsStallMonitor() {
  if (!isRuntimeInstrumentationEnabled() || jsMonitorFrameId !== null) return;

  jsMonitorLastFrameAt = Date.now();

  const tick = () => {
    const now = Date.now();
    const gap = now - jsMonitorLastFrameAt;

    if (jsMonitorLastFrameAt > 0) {
      recordJsStall(gap, "raf_gap");
    }

    jsMonitorLastFrameAt = now;
    jsMonitorFrameId = requestAnimationFrame(tick);
  };

  jsMonitorFrameId = requestAnimationFrame(tick);
}

function stopJsStallMonitor() {
  if (jsMonitorFrameId !== null) {
    cancelAnimationFrame(jsMonitorFrameId);
    jsMonitorFrameId = null;
  }
}

export function startRuntimeInstrumentation() {
  if (!isRuntimeInstrumentationEnabled() || instrumentationStarted) return;

  instrumentationStarted = true;
  logEvent("instrumentation_started", {
    summaryEveryMs: SUMMARY_INTERVAL_MS,
    jsStallThresholdMs: JS_STALL_THRESHOLD_MS,
  });

  startJsStallMonitor();

  summaryIntervalId = setInterval(() => {
    printRuntimeSummary();
  }, SUMMARY_INTERVAL_MS);
}

export function stopRuntimeInstrumentation() {
  if (!instrumentationStarted) return;

  instrumentationStarted = false;
  stopJsStallMonitor();

  if (summaryIntervalId) {
    clearInterval(summaryIntervalId);
    summaryIntervalId = null;
  }

  printRuntimeSummary();
  logEvent("instrumentation_stopped");
}

export function useRuntimeRenderProbe(screen: string) {
  useLayoutEffect(() => {
    recordScreenRender(screen);
  });
}
