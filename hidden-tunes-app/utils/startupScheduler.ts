import { InteractionManager } from "react-native";

import {
  logPlaybackDiagnostic,
  logPlaybackDiagnosticChurnWarning,
} from "../services/playbackDiagnostics"; // TEMP_PLAYBACK_DIAGNOSTICS
import {
  recordDeferredTaskCompleted,
  recordDeferredTaskScheduled,
} from "./playbackStressDiagnostics";
import {
  recordStartupTaskComplete,
  recordStartupTaskScheduled,
} from "./startupDiagnostics";

export type StartupPhase =
  | "critical"
  | "afterPaint"
  | "afterInteraction"
  | "background"
  | "deferred"
  | "idle";

type StartupTask = () => void | Promise<void>;

const scheduledTaskNames = new Set<string>();
const BACKGROUND_STARTUP_DELAY_MS = 720;
const DEFERRED_STARTUP_DELAY_MS = 1500;
const IDLE_STARTUP_DELAY_MS = 5000;

export function scheduleStartupTask(
  phase: StartupPhase,
  name: string,
  task: StartupTask
): () => void {
  if (scheduledTaskNames.has(name)) {
    return () => {};
  }

  scheduledTaskNames.add(name);
  recordStartupTaskScheduled(name, phase);
  recordDeferredTaskScheduled();
  // TEMP_PLAYBACK_DIAGNOSTICS
  logPlaybackDiagnosticChurnWarning("repeated_startup_tasks", { name, phase });
  // TEMP_PLAYBACK_DIAGNOSTICS
  void logPlaybackDiagnostic("startup_task_scheduled", { name, phase });

  let cancelled = false;

  const runTask = async () => {
    if (cancelled) return;

    const startedAt = Date.now();

    try {
      // TEMP_PLAYBACK_DIAGNOSTICS
      void logPlaybackDiagnostic("startup_task_start", { name, phase });
      await task();
    } finally {
      if (!cancelled) {
        // TEMP_PLAYBACK_DIAGNOSTICS
        void logPlaybackDiagnostic("startup_task_complete", {
          name,
          phase,
          durationMs: Date.now() - startedAt,
        });
        recordStartupTaskComplete(name, phase, Date.now() - startedAt);
        recordDeferredTaskCompleted();
      }
    }
  };

  let interactionHandle: { cancel: () => void } | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let frameId: number | null = null;

  const cancel = () => {
    cancelled = true;
    interactionHandle?.cancel();
    if (timeoutId) clearTimeout(timeoutId);
    if (frameId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameId);
    }
  };

  switch (phase) {
    case "critical":
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
      timeoutId = setTimeout(() => {
        void runTask();
      }, BACKGROUND_STARTUP_DELAY_MS);
      break;

    case "deferred":
      timeoutId = setTimeout(() => {
        void runTask();
      }, DEFERRED_STARTUP_DELAY_MS);
      break;

    case "idle":
      timeoutId = setTimeout(() => {
        void runTask();
      }, IDLE_STARTUP_DELAY_MS);
      break;
  }

  return cancel;
}

export function hasStartupTaskScheduled(name: string) {
  return scheduledTaskNames.has(name);
}

export function getScheduledStartupTaskCount() {
  return scheduledTaskNames.size;
}
