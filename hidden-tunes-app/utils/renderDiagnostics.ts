import { logPerformanceEvent } from "./performanceLogs";

const LONG_RENDER_MS = 24;
const LONG_LIST_MOUNT_MS = 120;

const renderCounts = new Map<string, number>();

function shouldTrackRenders() {
  return false;
}

export function trackRenderProbe(componentName: string) {
  if (!shouldTrackRenders()) {
    return () => {};
  }

  const startedAt = Date.now();
  renderCounts.set(componentName, (renderCounts.get(componentName) || 0) + 1);

  return () => {
    const durationMs = Date.now() - startedAt;

    if (durationMs >= LONG_RENDER_MS) {
      logPerformanceEvent("slow_render", {
        component: componentName,
        durationMs,
        renders: renderCounts.get(componentName) || 0,
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
