import { InteractionManager } from "react-native";

import {
  cancelDeferredTasksExcept,
  getDeferredSchedulerMetrics,
  registerDeferredCancelable,
  scheduleDeferredTask,
  unregisterDeferredCancelable,
} from "./deferredScheduler";
import { logPerformanceEvent } from "./performanceEvents";
import {
  recordDeferredPauseDuringPlayback,
  recordDeferredTaskRejected,
  recordStartupTaskPressure,
} from "./playbackStressDiagnostics";

const PLAYBACK_STARTUP_HOLD_MS = 2800;
const MAX_AUDIO_PRELOADS = 2;

let playbackStartupDepth = 0;
let playbackStartupHoldUntil = 0;
let gateEpoch = 0;
let audioPreloadCount = 0;

function shouldTrack() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

export function isPlaybackStartupActive() {
  return playbackStartupDepth > 0 || Date.now() < playbackStartupHoldUntil;
}

export function shouldAllowNonEssentialWork() {
  if (isPlaybackStartupActive()) {
    return false;
  }

  const metrics = getDeferredSchedulerMetrics();
  return metrics.globalRunning < 6 && metrics.schedulerQueueDepth < 8;
}

export function shouldAllowArtworkPrefetch() {
  return !isPlaybackStartupActive() && shouldAllowNonEssentialWork();
}

export function shouldAllowCatalogRefresh() {
  return !isPlaybackStartupActive();
}

export function shouldAllowAudioPreload() {
  if (isPlaybackStartupActive()) return false;
  if (audioPreloadCount >= MAX_AUDIO_PRELOADS) return false;

  return shouldAllowNonEssentialWork();
}

export function noteAudioPreloadStarted() {
  audioPreloadCount += 1;
}

export function noteAudioPreloadFinished() {
  audioPreloadCount = Math.max(0, audioPreloadCount - 1);
}

export function beginPlaybackStartup() {
  playbackStartupDepth += 1;
  playbackStartupHoldUntil = Date.now() + PLAYBACK_STARTUP_HOLD_MS;
  gateEpoch += 1;

  cancelNonEssentialDeferredTasks("playback_startup");

  if (shouldTrack()) {
    const metrics = getDeferredSchedulerMetrics();
    logPerformanceEvent("playback_startup_begin", {
      depth: playbackStartupDepth,
      gateEpoch,
      queueDepth: metrics.schedulerQueueDepth,
      activeDeferred: metrics.activeDeferred,
      globalRunning: metrics.globalRunning,
    });
    recordStartupTaskPressure(metrics.schedulerQueueDepth, metrics.globalRunning);
  }
}

export function endPlaybackStartup() {
  playbackStartupDepth = Math.max(0, playbackStartupDepth - 1);

  if (playbackStartupDepth === 0) {
    playbackStartupHoldUntil = Date.now() + 900;
  }

  if (shouldTrack()) {
    const metrics = getDeferredSchedulerMetrics();
    logPerformanceEvent("playback_startup_end", {
      depth: playbackStartupDepth,
      gateEpoch,
      queueDepth: metrics.schedulerQueueDepth,
      activeDeferred: metrics.activeDeferred,
      globalRunning: metrics.globalRunning,
    });
    recordStartupTaskPressure(metrics.schedulerQueueDepth, metrics.globalRunning);
  }
}

export function registerDeferredTask(name: string, cancel: () => void) {
  return registerDeferredCancelable(name, cancel);
}

export function unregisterDeferredTask(name: string) {
  unregisterDeferredCancelable(name);
}

export function cancelNonEssentialDeferredTasks(reason = "manual") {
  gateEpoch += 1;
  cancelDeferredTasksExcept(["playback_"], reason);

  if (shouldTrack()) {
    const metrics = getDeferredSchedulerMetrics();
    logPerformanceEvent("deferred_tasks_paused", {
      reason,
      gateEpoch,
      queueDepth: metrics.schedulerQueueDepth,
      activeDeferred: metrics.activeDeferred,
    });
    recordStartupTaskPressure(metrics.schedulerQueueDepth, metrics.globalRunning);
  }
}

export async function runDeferredTask<T>(
  name: string,
  task: () => Promise<T> | T,
  options: { priority?: "normal" | "playback"; allowDuringStartup?: boolean } = {}
): Promise<T | undefined> {
  const allowDuringStartup = options.allowDuringStartup ?? false;

  if (isPlaybackStartupActive() && !allowDuringStartup) {
    recordDeferredTaskRejected(name, "playback_startup");
    return undefined;
  }

  const metrics = getDeferredSchedulerMetrics();
  if (metrics.globalRunning >= 6) {
    recordDeferredTaskRejected(name, "concurrency_limit");
    return undefined;
  }

  try {
    return await task();
  } finally {
    unregisterDeferredTask(name);
    const latest = getDeferredSchedulerMetrics();
    recordStartupTaskPressure(latest.schedulerQueueDepth, latest.globalRunning);
  }
}

export function scheduleAfterPlaybackConfirmed(task: () => void | Promise<void>) {
  const runEpoch = gateEpoch;

  return scheduleDeferredTask({
    id: "playback_post_start_side_effects",
    category: "startup",
    phase: "afterInteraction",
    task: async () => {
      if (isPlaybackStartupActive() && runEpoch !== gateEpoch) {
        recordDeferredTaskRejected(
          "playback_post_start_side_effects",
          "stale_epoch"
        );
        return;
      }

      await task();
    },
  });
}

export function getPlaybackStartupGateStatus() {
  const metrics = getDeferredSchedulerMetrics();

  return {
    playbackStartupDepth,
    playbackStartupActive: isPlaybackStartupActive(),
    deferredRunning: metrics.globalRunning,
    trackedDeferred: metrics.schedulerQueueDepth,
    audioPreloadCount,
    gateEpoch,
    ...metrics,
  };
}
