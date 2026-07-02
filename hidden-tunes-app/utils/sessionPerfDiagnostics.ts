import { AppState, type AppStateStatus } from "react-native";

import {
  isBasicPerfDiagnosticsEnabled,
  isHeavyPerfDiagnosticsEnabled,
} from "./devDiagnostics";
import { logPerformanceEvent, nowMs } from "./performanceLogs";

let memoryMonitorId: ReturnType<typeof setInterval> | null = null;
let sessionStartedAt = nowMs();
let appStateSubscription: { remove: () => void } | null = null;

function readJsHeapMb(): number | undefined {
  const perf = globalThis.performance as
    | { memory?: { usedJSHeapSize?: number } }
    | undefined;

  const bytes = perf?.memory?.usedJSHeapSize;
  if (!bytes || !Number.isFinite(bytes)) return undefined;

  return Math.round(bytes / (1024 * 1024));
}

export function logArtworkLoadMs(uri: string, startedAt: number) {
  if (!isBasicPerfDiagnosticsEnabled()) return;

  logPerformanceEvent("artwork_load_ms", {
    uri: String(uri || "").slice(0, 96),
    ms: nowMs() - startedAt,
  });
}

export function logPlaybackStartLatency(
  ms: number,
  details: Record<string, string | number | boolean | undefined> = {}
) {
  if (!isBasicPerfDiagnosticsEnabled()) return;

  logPerformanceEvent("playback_start_latency_ms", { ms, ...details });
}

export function logScreenRenderDuration(
  screen: string,
  startedAt: number,
  details: Record<string, string | number | boolean | undefined> = {}
) {
  if (!isHeavyPerfDiagnosticsEnabled()) return;

  logPerformanceEvent("screen_render_ms", {
    screen,
    ms: nowMs() - startedAt,
    ...details,
  });
}

export function startSessionPerfDiagnostics() {
  if (!isHeavyPerfDiagnosticsEnabled()) return () => undefined;

  sessionStartedAt = nowMs();

  if (!memoryMonitorId) {
    memoryMonitorId = setInterval(() => {
      const heapMb = readJsHeapMb();
      const sessionMin = Math.round((nowMs() - sessionStartedAt) / 60000);

      logPerformanceEvent("session_memory_snapshot", {
        sessionMin,
        heapMb: heapMb ?? -1,
      });
    }, 60_000);
  }

  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState !== "background") return;

        const heapMb = readJsHeapMb();
        logPerformanceEvent("session_background_snapshot", {
          sessionMin: Math.round((nowMs() - sessionStartedAt) / 60000),
          heapMb: heapMb ?? -1,
        });
      }
    );
  }

  return () => {
    if (memoryMonitorId) {
      clearInterval(memoryMonitorId);
      memoryMonitorId = null;
    }

    appStateSubscription?.remove();
    appStateSubscription = null;
  };
}
