import { InteractionManager } from "react-native";

import { logPerformanceEvent } from "./performanceLogs";
import {
  recordDeferredPauseDuringPlayback,
  recordDeferredTaskRejected,
  recordStartupTaskPressure,
} from "./playbackStressDiagnostics";

type DeferredEntry = {
  name: string;
  cancel: () => void;
  scheduledAt: number;
};

const PLAYBACK_STARTUP_HOLD_MS = 2800;
const MAX_CONCURRENT_DEFERRED = 6;
const MAX_TRACKED_DEFERRED = 20;
const MAX_AUDIO_PRELOADS = 2;

let playbackStartupDepth = 0;
let playbackStartupHoldUntil = 0;
let gateEpoch = 0;
let deferredRunning = 0;
let audioPreloadCount = 0;

const deferredEntries = new Map<string, DeferredEntry>();

function shouldTrack() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

export function isPlaybackStartupActive() {
  return playbackStartupDepth > 0 || Date.now() < playbackStartupHoldUntil;
}

export function shouldAllowNonEssentialWork() {
  if (!isPlaybackStartupActive()) {
    return deferredRunning < MAX_CONCURRENT_DEFERRED;
  }

  return false;
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
    logPerformanceEvent("playback_startup_begin", {
      depth: playbackStartupDepth,
      gateEpoch,
      deferredRunning,
      trackedDeferred: deferredEntries.size,
    });
    recordStartupTaskPressure(deferredEntries.size, deferredRunning);
  }
}

export function endPlaybackStartup() {
  playbackStartupDepth = Math.max(0, playbackStartupDepth - 1);

  if (playbackStartupDepth === 0) {
    playbackStartupHoldUntil = Date.now() + 900;
  }

  if (shouldTrack()) {
    logPerformanceEvent("playback_startup_end", {
      depth: playbackStartupDepth,
      gateEpoch,
      deferredRunning,
      trackedDeferred: deferredEntries.size,
    });
    recordStartupTaskPressure(deferredEntries.size, deferredRunning);
  }
}

export function registerDeferredTask(name: string, cancel: () => void) {
  const existing = deferredEntries.get(name);

  if (existing) {
    existing.cancel();
    deferredEntries.delete(name);
  }

  if (deferredEntries.size >= MAX_TRACKED_DEFERRED && !name.startsWith("playback_")) {
    recordDeferredTaskRejected(name, "tracked_limit");
    cancel();
    return false;
  }

  deferredEntries.set(name, {
    name,
    cancel,
    scheduledAt: Date.now(),
  });

  return true;
}

export function unregisterDeferredTask(name: string) {
  deferredEntries.delete(name);
}

export function cancelNonEssentialDeferredTasks(reason = "manual") {
  gateEpoch += 1;

  deferredEntries.forEach((entry, name) => {
    if (name.startsWith("playback_")) return;

    entry.cancel();
    deferredEntries.delete(name);
    recordDeferredPauseDuringPlayback(name, reason);
  });

  if (shouldTrack()) {
    logPerformanceEvent("deferred_tasks_paused", {
      reason,
      gateEpoch,
      remainingTracked: deferredEntries.size,
    });
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

  if (deferredRunning >= MAX_CONCURRENT_DEFERRED) {
    recordDeferredTaskRejected(name, "concurrency_limit");
    return undefined;
  }

  deferredRunning += 1;

  try {
    return await task();
  } finally {
    deferredRunning = Math.max(0, deferredRunning - 1);
    unregisterDeferredTask(name);
    recordStartupTaskPressure(deferredEntries.size, deferredRunning);
  }
}

export function scheduleAfterPlaybackConfirmed(task: () => void | Promise<void>) {
  const runEpoch = gateEpoch;
  const taskName = `playback_post_start_${Date.now()}`;

  const handle = InteractionManager.runAfterInteractions(() => {
    if (isPlaybackStartupActive() && runEpoch !== gateEpoch) {
      recordDeferredTaskRejected(taskName, "stale_epoch");
      return;
    }

    void (async () => {
      await task();
    })();
  });

  registerDeferredTask(taskName, () => {
    handle.cancel();
  });

  return () => {
    handle.cancel();
    unregisterDeferredTask(taskName);
  };
}

export function getPlaybackStartupGateStatus() {
  return {
    playbackStartupDepth,
    playbackStartupActive: isPlaybackStartupActive(),
    deferredRunning,
    trackedDeferred: deferredEntries.size,
    audioPreloadCount,
    gateEpoch,
  };
}
