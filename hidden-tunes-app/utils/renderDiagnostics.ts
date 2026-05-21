import { logPerformanceEvent } from "./performanceEvents";
import { recordHomeRerender } from "./homeRenderDiagnostics";

const LONG_RENDER_MS = 24;
const MAX_RENDER_PROBE_MS = 800;
const LONG_LIST_MOUNT_MS = 120;

const renderCounts = new Map<string, number>();

function shouldTrackRenders() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

export function beginRenderProbe(componentName: string) {
  if (!shouldTrackRenders()) {
    return () => {};
  }

  const startedAt = Date.now();
  const renders = (renderCounts.get(componentName) || 0) + 1;
  renderCounts.set(componentName, renders);

  if (componentName === "HomeScreen") {
    recordHomeRerender();
  }

  return () => {
    const durationMs = Date.now() - startedAt;

    if (durationMs >= LONG_RENDER_MS && durationMs <= MAX_RENDER_PROBE_MS) {
      logPerformanceEvent("slow_render", {
        component: componentName,
        durationMs,
        renders,
      });
    }
  };
}

export function trackRenderProbe(componentName: string) {
  if (!shouldTrackRenders()) return;

  const startedAt = Date.now();
  const renders = (renderCounts.get(componentName) || 0) + 1;
  renderCounts.set(componentName, renders);

  if (componentName === "HomeScreen") {
    recordHomeRerender();
  }

  requestAnimationFrame(() => {
    const durationMs = Date.now() - startedAt;

    if (durationMs >= LONG_RENDER_MS && durationMs <= MAX_RENDER_PROBE_MS) {
      logPerformanceEvent("slow_render", {
        component: componentName,
        durationMs,
        renders,
      });
    }
  });
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
