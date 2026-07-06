/**
 * DEV-only idle CPU investigation helpers.
 * Disable via ENABLE_CPU_IDLE_PROFILING in devDiagnostics.ts when done.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { isCpuIdleProfilingEnabled } from "./devDiagnostics";

const LOG_TAG = "[HiddenTunes:cpu-idle]";
const SUMMARY_INTERVAL_MS = 30_000;

type RenderBucket = {
  count: number;
  windowStart: number;
};

type TimerRecord = {
  label: string;
  createdAt: number;
};

const renderBuckets = new Map<string, RenderBucket>();
const activeTimers = new Map<string, TimerRecord>();
let listenerCount = 0;
let summaryIntervalId: ReturnType<typeof setInterval> | null = null;
let profilingStarted = false;
let timerSequence = 0;

function logEvent(event: string, payload?: Record<string, unknown>) {
  if (!isCpuIdleProfilingEnabled()) return;
  if (payload) {
    console.log(LOG_TAG, event, payload);
  } else {
    console.log(LOG_TAG, event);
  }
}

function bumpRender(screen: string) {
  if (!isCpuIdleProfilingEnabled()) return;

  let bucket = renderBuckets.get(screen);
  if (!bucket) {
    bucket = { count: 0, windowStart: Date.now() };
    renderBuckets.set(screen, bucket);
  }

  bucket.count += 1;
}

export function startCpuIdleProfiling() {
  if (!isCpuIdleProfilingEnabled() || profilingStarted) return;

  profilingStarted = true;
  logEvent("profiling_started", {
    appState: AppState.currentState,
    summaryEveryMs: SUMMARY_INTERVAL_MS,
  });

  summaryIntervalId = setInterval(() => {
    printCpuIdleSummary();
  }, SUMMARY_INTERVAL_MS);
}

export function stopCpuIdleProfiling() {
  if (!profilingStarted) return;

  profilingStarted = false;

  if (summaryIntervalId) {
    clearInterval(summaryIntervalId);
    summaryIntervalId = null;
  }

  printCpuIdleSummary();
  logEvent("profiling_stopped");
}

export function printCpuIdleSummary() {
  if (!isCpuIdleProfilingEnabled()) return;

  const renders = Object.fromEntries(
    [...renderBuckets.entries()].map(([screen, bucket]) => [screen, bucket.count])
  );
  const totalRenders = Object.values(renders).reduce(
    (total, count) => total + count,
    0
  );

  logEvent("summary", {
    appState: AppState.currentState,
    totalRenders,
    renders,
    activeTimers: activeTimers.size,
    activeTimerLabels: [...activeTimers.values()].map((timer) => timer.label),
    listenerCount,
  });

  renderBuckets.forEach((bucket) => {
    bucket.count = 0;
    bucket.windowStart = Date.now();
  });
}

export function recordCpuTimerCreated(label: string): string {
  const id = `${label}:${++timerSequence}`;

  if (isCpuIdleProfilingEnabled()) {
    activeTimers.set(id, { label, createdAt: Date.now() });
    logEvent("timer_created", { id, label, active: activeTimers.size });
  }

  return id;
}

export function recordCpuTimerCleared(id: string | null | undefined) {
  if (!id || !isCpuIdleProfilingEnabled()) return;

  const record = activeTimers.get(id);
  if (!record) return;

  activeTimers.delete(id);
  logEvent("timer_cleared", {
    id,
    label: record.label,
    lifetimeMs: Date.now() - record.createdAt,
    active: activeTimers.size,
  });
}

export function recordCpuListenerRegistered(label: string) {
  if (!isCpuIdleProfilingEnabled()) return;

  listenerCount += 1;
  logEvent("listener_registered", { label, total: listenerCount });
}

export function recordCpuListenerUnregistered(label: string) {
  if (!isCpuIdleProfilingEnabled()) return;

  listenerCount = Math.max(0, listenerCount - 1);
  logEvent("listener_unregistered", { label, total: listenerCount });
}

export function useCpuRenderProbe(screen: string) {
  useLayoutEffect(() => {
    bumpRender(screen);
  });
}

export function useCpuContextProbe(
  providerName: string,
  revisionKey: string | number
) {
  const previousKeyRef = useRef(revisionKey);

  useEffect(() => {
    if (!isCpuIdleProfilingEnabled()) return;
    if (previousKeyRef.current === revisionKey) return;

    logEvent("context_update", {
      provider: providerName,
      from: String(previousKeyRef.current),
      to: String(revisionKey),
    });
    previousKeyRef.current = revisionKey;
  }, [providerName, revisionKey]);
}

export function useCpuAppStateProbe(screen: string) {
  useEffect(() => {
    if (!isCpuIdleProfilingEnabled()) return undefined;

    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        logEvent("app_state", { screen, state: nextState });
      }
    );

    return () => {
      subscription.remove();
    };
  }, [screen]);
}
