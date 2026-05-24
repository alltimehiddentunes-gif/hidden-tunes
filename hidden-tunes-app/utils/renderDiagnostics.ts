import { logPerformanceEvent } from "./performanceLogs";
import { isPerformanceVerificationEnabled } from "./performanceVerification";

const LONG_RENDER_MS = 24;
const LONG_LIST_MOUNT_MS = 120;
const LONG_JS_TASK_MS = 80;

const renderCounts = new Map<string, number>();

function shouldTrackRenders() {
  return isPerformanceVerificationEnabled();
}

export function incrementRenderCount(componentName: string) {
  if (!shouldTrackRenders()) return;

  renderCounts.set(componentName, (renderCounts.get(componentName) || 0) + 1);
}

export function trackRenderProbe(componentName: string) {
  incrementRenderCount(componentName);

  if (!shouldTrackRenders()) {
    return () => {};
  }

  const startedAt = Date.now();
  const renders = renderCounts.get(componentName) || 0;

  return () => {
    const durationMs = Date.now() - startedAt;

    if (durationMs >= LONG_RENDER_MS) {
      logPerformanceEvent("slow_render", {
        component: componentName,
        durationMs,
        renders,
      });
    }

    if (durationMs >= LONG_JS_TASK_MS) {
      logPerformanceEvent("long_render_task", {
        component: componentName,
        durationMs,
        renders,
      });
    }
  };
}

export function logListMountTiming(
  screen: string,
  itemCount: number,
  startedAt: number
) {
  if (!shouldTrackRenders()) return;

  const mountMs = Date.now() - startedAt;

  logPerformanceEvent(mountMs >= LONG_LIST_MOUNT_MS ? "slow_list_mount" : "list_mount", {
    screen,
    itemCount,
    mountMs,
  });
}

export function resetRenderDiagnostics() {
  renderCounts.clear();
}

export function getRenderDiagnostics() {
  const rerenderCounts = Object.fromEntries(renderCounts.entries());
  const totalRerenderSamples = Object.values(rerenderCounts).reduce(
    (total, count) => total + count,
    0
  );

  return {
    rerenderCounts,
    totalRerenderSamples,
    trackedComponents: renderCounts.size,
  };
}
