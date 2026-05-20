import { InteractionManager } from "react-native";

import {
  recordStartupTaskComplete,
  recordStartupTaskScheduled,
} from "./startupDiagnostics";

export type StartupPhase =
  | "critical"
  | "afterPaint"
  | "afterInteraction"
  | "background";

type StartupTask = () => void | Promise<void>;

const scheduledTaskNames = new Set<string>();
const BACKGROUND_STARTUP_DELAY_MS = 720;

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

  let cancelled = false;

  const runTask = async () => {
    if (cancelled) return;

    const startedAt = Date.now();

    try {
      await task();
    } finally {
      if (!cancelled) {
        recordStartupTaskComplete(name, phase, Date.now() - startedAt);
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
  }

  return cancel;
}

export function hasStartupTaskScheduled(name: string) {
  return scheduledTaskNames.has(name);
}
