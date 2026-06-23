import { isDiscoveryPerfDiagnosticsEnabled } from "./devDiagnostics";

type ScreenStats = {
  screen: string;
  startedAt: number;
  requestCount: number;
  cancelledCount: number;
  activeRequests: number;
  slowSections: number;
  renderBursts: number;
};

const screenStats = new Map<string, ScreenStats>();
const LOG_PREFIX = "[HTDiscoveryPerf]";

function getStats(screen: string): ScreenStats {
  const existing = screenStats.get(screen);
  if (existing) return existing;

  const next: ScreenStats = {
    screen,
    startedAt: Date.now(),
    requestCount: 0,
    cancelledCount: 0,
    activeRequests: 0,
    slowSections: 0,
    renderBursts: 0,
  };
  screenStats.set(screen, next);
  return next;
}

function log(event: string, payload: Record<string, unknown> = {}) {
  if (!isDiscoveryPerfDiagnosticsEnabled()) return;
  console.log(LOG_PREFIX, event, { at: Date.now(), ...payload });
}

export function trackDiscoveryScreenMount(screen: string) {
  if (!isDiscoveryPerfDiagnosticsEnabled()) return;
  screenStats.set(screen, {
    screen,
    startedAt: Date.now(),
    requestCount: 0,
    cancelledCount: 0,
    activeRequests: 0,
    slowSections: 0,
    renderBursts: 0,
  });
  log("screen_mount", { screen });
}

export function trackDiscoveryScreenUnmount(screen: string) {
  if (!isDiscoveryPerfDiagnosticsEnabled()) return;
  const stats = screenStats.get(screen);
  if (stats) {
    log("screen_unmount", {
      screen,
      requestCount: stats.requestCount,
      cancelledCount: stats.cancelledCount,
      slowSections: stats.slowSections,
      renderBursts: stats.renderBursts,
      durationMs: Date.now() - stats.startedAt,
    });
  }
  screenStats.delete(screen);
}

export function trackDiscoveryRequestStart(screen: string, label: string) {
  if (!isDiscoveryPerfDiagnosticsEnabled()) return;
  const stats = getStats(screen);
  stats.requestCount += 1;
  stats.activeRequests += 1;
  log("request_start", { screen, label, activeRequests: stats.activeRequests });
}

export function trackDiscoveryRequestEnd(screen: string, label: string, durationMs: number) {
  if (!isDiscoveryPerfDiagnosticsEnabled()) return;
  const stats = getStats(screen);
  stats.activeRequests = Math.max(0, stats.activeRequests - 1);
  if (durationMs >= 1200) {
    stats.slowSections += 1;
    log("slow_section", { screen, label, durationMs });
  }
  log("request_end", { screen, label, durationMs, activeRequests: stats.activeRequests });
}

export function trackDiscoveryRequestCancelled(screen: string, label: string) {
  if (!isDiscoveryPerfDiagnosticsEnabled()) return;
  const stats = getStats(screen);
  stats.cancelledCount += 1;
  stats.activeRequests = Math.max(0, stats.activeRequests - 1);
  log("request_cancelled", { screen, label, cancelledCount: stats.cancelledCount });
}

export function trackDiscoveryRenderBurst(screen: string, detail: string) {
  if (!isDiscoveryPerfDiagnosticsEnabled()) return;
  const stats = getStats(screen);
  stats.renderBursts += 1;
  log("render_burst_warning", { screen, detail, renderBursts: stats.renderBursts });
}

export async function withDiscoveryRequestTiming<T>(
  screen: string,
  label: string,
  task: () => Promise<T>
) {
  if (!isDiscoveryPerfDiagnosticsEnabled()) {
    return task();
  }

  const started = Date.now();
  trackDiscoveryRequestStart(screen, label);
  try {
    return await task();
  } finally {
    trackDiscoveryRequestEnd(screen, label, Date.now() - started);
  }
}
