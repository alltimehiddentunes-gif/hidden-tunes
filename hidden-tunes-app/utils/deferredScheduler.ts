import { InteractionManager } from "react-native";

import { logPerformanceEvent } from "./performanceEvents";
import { recordDeferredTaskRejected } from "./playbackStressDiagnostics";

export type DeferredCategory =
  | "artwork"
  | "startup"
  | "ranking"
  | "tv"
  | "preload"
  | "diagnostics"
  | "navigation";

export type DeferredSchedulePhase =
  | "immediate"
  | "afterPaint"
  | "afterInteraction"
  | "background";

type DeferredEntry = {
  id: string;
  category: DeferredCategory;
  cancel: () => void;
  scheduledAt: number;
  running: boolean;
};

const CATEGORY_LIMITS: Record<DeferredCategory, number> = {
  artwork: 2,
  startup: 3,
  ranking: 1,
  tv: 1,
  preload: 2,
  diagnostics: 1,
  navigation: 2,
};

const GLOBAL_RUNNING_LIMIT = 6;
const MAX_QUEUE_DEPTH = 10;
const STALE_TASK_MS = 12_000;
const BACKGROUND_DELAY_MS = 720;

const registry = new Map<string, DeferredEntry>();
const categoryRunning = new Map<DeferredCategory, number>();

let globalRunning = 0;
let dedupedTasks = 0;
let cancelledTasks = 0;
let staleTaskClears = 0;
let staleSweepTimer: ReturnType<typeof setInterval> | null = null;

function shouldTrack() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

function inferCategory(taskId: string): DeferredCategory {
  const id = taskId.toLowerCase();

  if (id.includes("artwork") || id.includes("image_prefetch")) {
    return "artwork";
  }

  if (id.includes("tv") || id.includes("youtube")) {
    return "tv";
  }

  if (id.includes("rank") || id.includes("discovery") || id.includes("mood")) {
    return "ranking";
  }

  if (
    id.includes("preload") ||
    id.includes("prewarm") ||
    id.includes("upcoming")
  ) {
    return "preload";
  }

  if (
    id.includes("diagnostic") ||
    id.includes("perf") ||
    id.includes("overlay")
  ) {
    return "diagnostics";
  }

  if (id.includes("navigation") || id.includes("genre_catalog")) {
    return "navigation";
  }

  return "startup";
}

function ensureStaleSweep() {
  if (!shouldTrack() || staleSweepTimer) return;

  staleSweepTimer = setInterval(() => {
    clearStaleDeferredTasks(false);
  }, 5000);
}

function getCategoryRunning(category: DeferredCategory) {
  return categoryRunning.get(category) || 0;
}

function setCategoryRunning(category: DeferredCategory, delta: number) {
  const next = Math.max(0, getCategoryRunning(category) + delta);
  categoryRunning.set(category, next);
}

export function clearStaleDeferredTasks(force = false) {
  const now = Date.now();
  let cleared = 0;

  registry.forEach((entry, id) => {
    if (entry.running && !force) return;

    if (force || now - entry.scheduledAt >= STALE_TASK_MS) {
      entry.cancel();
      registry.delete(id);
      cleared += 1;
      staleTaskClears += 1;
    }
  });

  if (shouldTrack() && cleared > 0) {
    logPerformanceEvent("deferred_stale_cleared", {
      cleared,
      force,
      queueDepth: registry.size,
      globalRunning,
    });
  }

  return cleared;
}

export function registerDeferredCancelable(
  id: string,
  cancel: () => void,
  category?: DeferredCategory
) {
  ensureStaleSweep();
  clearStaleDeferredTasks(false);

  const resolvedCategory = category || inferCategory(id);
  const existing = registry.get(id);

  if (existing) {
    dedupedTasks += 1;
    existing.cancel();
    registry.delete(id);
  }

  if (registry.size >= MAX_QUEUE_DEPTH) {
    clearStaleDeferredTasks(true);

    if (registry.size >= MAX_QUEUE_DEPTH) {
      recordDeferredTaskRejected(id, "queue_depth");
      cancel();
      return false;
    }
  }

  registry.set(id, {
    id,
    category: resolvedCategory,
    cancel,
    scheduledAt: Date.now(),
    running: false,
  });

  return true;
}

export function unregisterDeferredCancelable(id: string) {
  const entry = registry.get(id);
  if (!entry) return;

  if (entry.running) {
    globalRunning = Math.max(0, globalRunning - 1);
    setCategoryRunning(entry.category, -1);
  }

  registry.delete(id);
}

function markDeferredRunning(id: string, running: boolean) {
  const entry = registry.get(id);
  if (!entry) return;

  if (entry.running === running) return;

  entry.running = running;

  if (running) {
    globalRunning += 1;
    setCategoryRunning(entry.category, 1);
  } else {
    globalRunning = Math.max(0, globalRunning - 1);
    setCategoryRunning(entry.category, -1);
  }
}

function canStartCategory(category: DeferredCategory) {
  if (globalRunning >= GLOBAL_RUNNING_LIMIT) {
    return false;
  }

  return getCategoryRunning(category) < CATEGORY_LIMITS[category];
}

export function cancelDeferredTasksByPrefix(
  prefix: string,
  reason = "cancelled"
) {
  registry.forEach((entry, id) => {
    if (!id.startsWith(prefix)) return;

    entry.cancel();
    registry.delete(id);
    cancelledTasks += 1;

    if (shouldTrack()) {
      logPerformanceEvent("deferred_task_cancelled", { id, reason });
    }
  });
}

export function cancelDeferredTasksExcept(
  keepPrefixes: string[],
  reason = "playback_priority"
) {
  registry.forEach((entry, id) => {
    if (keepPrefixes.some((prefix) => id.startsWith(prefix))) {
      return;
    }

    entry.cancel();
    registry.delete(id);
    cancelledTasks += 1;

    if (shouldTrack()) {
      logPerformanceEvent("deferred_task_cancelled", { id, reason });
    }
  });
}

export function scheduleDeferredTask(options: {
  id: string;
  category?: DeferredCategory;
  phase?: DeferredSchedulePhase;
  delayMs?: number;
  task: () => void | Promise<void>;
  allowDuringPlayback?: boolean;
}): () => void {
  ensureStaleSweep();
  clearStaleDeferredTasks(false);

  const id = options.id;
  const category = options.category || inferCategory(id);
  const phase = options.phase || "background";

  if (registry.has(id)) {
    dedupedTasks += 1;
    return () => {
      const entry = registry.get(id);
      entry?.cancel();
    };
  }

  if (!canStartCategory(category) && phase !== "immediate") {
    recordDeferredTaskRejected(id, `category_limit_${category}`);
    return () => {};
  }

  if (registry.size >= MAX_QUEUE_DEPTH) {
    clearStaleDeferredTasks(true);

    if (registry.size >= MAX_QUEUE_DEPTH) {
      recordDeferredTaskRejected(id, "queue_depth");
      return () => {};
    }
  }

  let cancelled = false;
  let interactionHandle: { cancel: () => void } | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let frameId: number | null = null;

  const runTask = async () => {
    if (cancelled) return;

    if (!canStartCategory(category)) {
      recordDeferredTaskRejected(id, "category_limit_at_run");
      unregisterDeferredCancelable(id);
      return;
    }

    markDeferredRunning(id, true);
    const startedAt = Date.now();

    try {
      await options.task();
    } finally {
      markDeferredRunning(id, false);
      unregisterDeferredCancelable(id);

      if (shouldTrack()) {
        logPerformanceEvent("deferred_task_complete", {
          id,
          category,
          durationMs: Date.now() - startedAt,
          queueDepth: registry.size,
        });
      }
    }
  };

  const cancel = () => {
    if (cancelled) return;

    cancelled = true;
    cancelledTasks += 1;
    interactionHandle?.cancel();
    if (timeoutId) clearTimeout(timeoutId);
    if (frameId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameId);
    }
    unregisterDeferredCancelable(id);
  };

  if (!registerDeferredCancelable(id, cancel, category)) {
    return () => {};
  }

  switch (phase) {
    case "immediate":
      void runTask();
      break;

    case "afterPaint":
      if (typeof requestAnimationFrame === "function") {
        frameId = requestAnimationFrame(() => {
          void runTask();
        });
      } else {
        timeoutId = setTimeout(() => {
          void runTask();
        }, 0);
      }
      break;

    case "afterInteraction":
      interactionHandle = InteractionManager.runAfterInteractions(() => {
        void runTask();
      });
      break;

    case "background":
    default:
      timeoutId = setTimeout(() => {
        void runTask();
      }, options.delayMs ?? BACKGROUND_DELAY_MS);
      break;
  }

  if (shouldTrack()) {
    logPerformanceEvent("deferred_task_scheduled", {
      id,
      category,
      phase,
      queueDepth: registry.size,
      globalRunning,
    });
  }

  return cancel;
}

export function getDeferredSchedulerMetrics() {
  const categoryCounts: Record<DeferredCategory, number> = {
    artwork: 0,
    startup: 0,
    ranking: 0,
    tv: 0,
    preload: 0,
    diagnostics: 0,
    navigation: 0,
  };

  registry.forEach((entry) => {
    categoryCounts[entry.category] += 1;
  });

  return {
    schedulerQueueDepth: registry.size,
    activeDeferred: globalRunning,
    scheduledDeferred: registry.size,
    globalRunning,
    categoryCounts,
    dedupedTasks,
    cancelledTasks,
    staleTaskClears,
    startupTaskPressure: registry.size + globalRunning,
  };
}

export function resetDeferredScheduler() {
  registry.forEach((entry) => entry.cancel());
  registry.clear();
  categoryRunning.clear();
  globalRunning = 0;
  dedupedTasks = 0;
  cancelledTasks = 0;
  staleTaskClears = 0;

  if (staleSweepTimer) {
    clearInterval(staleSweepTimer);
    staleSweepTimer = null;
  }
}
