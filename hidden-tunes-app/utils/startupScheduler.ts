import {
  cancelDeferredTasksExcept,
  scheduleDeferredTask,
  type DeferredSchedulePhase,
} from "./deferredScheduler";
import { isPlaybackStartupActive } from "./playbackStartupGate";
import { recordDeferredTaskRejected } from "./playbackStressDiagnostics";
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

function mapPhase(phase: StartupPhase): DeferredSchedulePhase {
  switch (phase) {
    case "critical":
      return "immediate";
    case "afterPaint":
      return "afterPaint";
    case "afterInteraction":
      return "afterInteraction";
    case "background":
    default:
      return "background";
  }
}

export function scheduleStartupTask(
  phase: StartupPhase,
  name: string,
  task: StartupTask
): () => void {
  if (scheduledTaskNames.has(name)) {
    return () => {};
  }

  if (phase !== "critical" && isPlaybackStartupActive()) {
    recordDeferredTaskRejected(name, "playback_startup_active");
    return () => {};
  }

  scheduledTaskNames.add(name);
  recordStartupTaskScheduled(name, phase);

  const cancel = scheduleDeferredTask({
    id: name,
    phase: mapPhase(phase),
    task: async () => {
      if (phase !== "critical" && isPlaybackStartupActive()) {
        recordDeferredTaskRejected(name, "playback_startup_at_run");
        return;
      }

      const startedAt = Date.now();

      try {
        await task();
      } finally {
        recordStartupTaskComplete(name, phase, Date.now() - startedAt);
        scheduledTaskNames.delete(name);
      }
    },
  });

  return () => {
    scheduledTaskNames.delete(name);
    cancel();
  };
}

export function hasStartupTaskScheduled(name: string) {
  return scheduledTaskNames.has(name);
}

export function getScheduledStartupTaskCount() {
  return scheduledTaskNames.size;
}

export function pauseStartupTasksForPlayback() {
  cancelDeferredTasksExcept(["playback_"], "playback_priority");
}
