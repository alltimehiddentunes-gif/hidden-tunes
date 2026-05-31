import {
  isBasicPerfDiagnosticsEnabled,
  isHeavyPerfDiagnosticsEnabled,
} from "./devDiagnostics";
import { getPlaybackRenderDiagnostics } from "./playbackRenderDiagnostics";
import { getPlaybackStressDiagnostics } from "./playbackStressDiagnostics";
import { getRenderDiagnostics } from "./renderDiagnostics";
import { getStartupDiagnostics } from "./startupDiagnostics";

type PerformanceLogDetails = Record<string, string | number | boolean | undefined>;

type MetricSummary = {
  cacheHits: number;
  cacheMisses: number;
  screenReadyTotal: number;
  screenReadyCount: number;
  apiRefreshTotal: number;
  apiRefreshCount: number;
  artworkFailures: number;
  slowEndpointWarnings: number;
};

const metrics: MetricSummary = {
  cacheHits: 0,
  cacheMisses: 0,
  screenReadyTotal: 0,
  screenReadyCount: 0,
  apiRefreshTotal: 0,
  apiRefreshCount: 0,
  artworkFailures: 0,
  slowEndpointWarnings: 0,
};

type LastScreenSnapshot = {
  screen: string;
  readyMs: number;
  cache: string;
  itemCount: number;
  apiRefreshMs?: number;
  updatedAt: number;
};

let lastScreenSnapshot: LastScreenSnapshot | null = null;

const BASIC_PERF_EVENTS = new Set([
  "screen_ready",
  "tap_to_play",
  "tap_to_audio_start_ms",
  "slow_endpoint",
]);

function shouldLogPerformance() {
  return isBasicPerfDiagnosticsEnabled();
}

function shouldLogPerformanceEvent(event: string) {
  if (!isBasicPerfDiagnosticsEnabled()) return false;
  if (BASIC_PERF_EVENTS.has(event)) return true;
  if (event.startsWith("slow_")) return true;
  return isHeavyPerfDiagnosticsEnabled();
}

export function nowMs() {
  return Date.now();
}

export function startPerformanceTimer() {
  return nowMs();
}

export function logPerformanceEvent(
  event: string,
  details: PerformanceLogDetails = {}
) {
  if (!shouldLogPerformanceEvent(event)) return;

  console.log("[HiddenTunes:perf]", event, details);
}

export function logScreenReady(
  screen: string,
  startedAt: number,
  details: PerformanceLogDetails = {}
) {
  const readyMs = nowMs() - startedAt;
  metrics.screenReadyTotal += readyMs;
  metrics.screenReadyCount += 1;

  lastScreenSnapshot = {
    screen,
    readyMs,
    cache: String(details.cache || "unknown"),
    itemCount: Number(details.count || details.itemCount || details.tracks || 0),
    updatedAt: nowMs(),
  };

  logPerformanceEvent("screen_ready", {
    screen,
    readyMs,
    ...details,
  });
}

export function logApiRefresh(
  screen: string,
  startedAt: number,
  details: PerformanceLogDetails = {}
) {
  const refreshMs = nowMs() - startedAt;
  metrics.apiRefreshTotal += refreshMs;
  metrics.apiRefreshCount += 1;

  if (lastScreenSnapshot?.screen === screen) {
    lastScreenSnapshot = {
      ...lastScreenSnapshot,
      apiRefreshMs: refreshMs,
      updatedAt: nowMs(),
    };
  }

  logPerformanceEvent("api_refresh", {
    screen,
    refreshMs,
    ...details,
  });
}

export function logCacheResult(
  screen: string,
  hit: boolean,
  details: PerformanceLogDetails = {}
) {
  if (hit) {
    metrics.cacheHits += 1;
  } else {
    metrics.cacheMisses += 1;
  }

  logPerformanceEvent("cache_result", {
    screen,
    cache: hit ? "hit" : "miss",
    ...details,
  });
}

let artworkFailureLogCount = 0;
const MAX_ARTWORK_FAILURE_LOGS = 12;

export function recordArtworkFailure(details: PerformanceLogDetails = {}) {
  metrics.artworkFailures += 1;

  if (!shouldLogPerformance()) return;
  if (artworkFailureLogCount >= MAX_ARTWORK_FAILURE_LOGS) return;

  artworkFailureLogCount += 1;
  logPerformanceEvent("artwork_failure", details);
}

export function recordSlowEndpointWarning(details: PerformanceLogDetails = {}) {
  metrics.slowEndpointWarnings += 1;
  logPerformanceEvent("slow_endpoint", details);
}

export function getLastScreenSnapshot() {
  return lastScreenSnapshot;
}

export function getPerformanceDiagnostics() {
  const renderDiagnostics = getRenderDiagnostics();
  const playbackDiagnostics = getPlaybackRenderDiagnostics();
  const startupDiagnostics = getStartupDiagnostics();
  const stressDiagnostics = getPlaybackStressDiagnostics();

  return {
    cacheHitRate:
      metrics.cacheHits + metrics.cacheMisses > 0
        ? Math.round(
            (metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)) * 100
          )
        : 0,
    averageScreenReadyMs: metrics.screenReadyCount
      ? Math.round(metrics.screenReadyTotal / metrics.screenReadyCount)
      : 0,
    averageApiRefreshMs: metrics.apiRefreshCount
      ? Math.round(metrics.apiRefreshTotal / metrics.apiRefreshCount)
      : 0,
    artworkFailures: metrics.artworkFailures,
    slowEndpointWarnings: metrics.slowEndpointWarnings,
    lastScreenName: lastScreenSnapshot?.screen,
    lastScreenReadyMs: lastScreenSnapshot?.readyMs,
    lastScreenItemCount: lastScreenSnapshot?.itemCount,
    renderRerenderSamples: renderDiagnostics.totalRerenderSamples,
    renderTrackedComponents: renderDiagnostics.trackedComponents,
    playbackProgressUpdatesPerMinute:
      playbackDiagnostics.progressUpdatesLastMinute,
    playbackProgressUpdatesWindow: playbackDiagnostics.progressUpdatesWindow,
    playbackSubscriberRenders:
      playbackDiagnostics.totalPlaybackSubscriberRenders,
    queueInvalidationWarnings: playbackDiagnostics.queueInvalidationWarnings,
    startupFirstCachedMs: startupDiagnostics.firstCachedContentMs ?? undefined,
    startupFirstApiMs: startupDiagnostics.firstApiRefreshMs ?? undefined,
    startupCompletedTasks: startupDiagnostics.completedTaskCount,
    startupScheduledTasks: startupDiagnostics.scheduledTaskCount,
    startupPlaybackRestoreMs: startupDiagnostics.playbackRestoreMs ?? undefined,
    avgTapToAudioStartMs: stressDiagnostics.avgTapToAudioStartMs,
    avgNextTrackTransitionMs: stressDiagnostics.avgNextTrackTransitionMs,
    avgPauseResumeMs: stressDiagnostics.avgPauseResumeMs,
    playbackSessionMinutes: stressDiagnostics.playbackSessionDurationMs
      ? Math.round(stressDiagnostics.playbackSessionDurationMs / 60000)
      : 0,
    artworkPrefetchLoaded: stressDiagnostics.artworkPrefetchSuccesses,
    activeDeferredTasks: stressDiagnostics.activeDeferredTasks,
    queueTortureWarnings: stressDiagnostics.queueTortureWarnings,
    audioReloadWindowCount: stressDiagnostics.audioReloadCountWindow,
    offlineCacheStartups: stressDiagnostics.offlineCacheStartupSuccesses,
    stressWarningCount: stressDiagnostics.stressWarnings.length,
  };
}

export function logPerformanceDiagnosticsOverlay(screen = "global") {
  if (!isHeavyPerfDiagnosticsEnabled()) return;

  logPerformanceEvent("diagnostics_overlay", {
    screen,
    ...getPerformanceDiagnostics(),
  });
}

const SLOW_SEARCH_THRESHOLD_MS = 80;
const SLOW_TAP_TO_PLAY_THRESHOLD_MS = 80;

export function logSlowInteraction(
  kind: string,
  durationMs: number,
  details: PerformanceLogDetails = {}
) {
  if (!shouldLogPerformance()) return;

  const threshold = kind.includes("tap")
    ? SLOW_TAP_TO_PLAY_THRESHOLD_MS
    : SLOW_SEARCH_THRESHOLD_MS;

  if (durationMs < threshold) return;

  console.warn("[HiddenTunes:perf:slow]", kind, {
    durationMs: Math.round(durationMs),
    ...details,
  });
}

export function logTapToPlay(
  screen: string,
  startedAt: number,
  details: PerformanceLogDetails = {}
) {
  const tapToPlayMs = nowMs() - startedAt;

  logPerformanceEvent("tap_to_play", {
    screen,
    tapToPlayMs,
    ...details,
  });

  logSlowInteraction("tap_to_play", tapToPlayMs, {
    screen,
    ...details,
  });
}

export function logPerformanceSummary(
  screen: string,
  details: {
    cache: "hit" | "miss" | "memory" | "storage" | "none";
    firstContentMs?: number;
    apiRefreshMs?: number;
    itemCount: number;
    emptyStateReason?: string;
  } & PerformanceLogDetails
) {
  lastScreenSnapshot = {
    screen,
    readyMs: Number(details.firstContentMs || lastScreenSnapshot?.readyMs || 0),
    cache: details.cache,
    itemCount: details.itemCount,
    apiRefreshMs: details.apiRefreshMs,
    updatedAt: nowMs(),
  };

  if (!isHeavyPerfDiagnosticsEnabled()) return;

  logPerformanceEvent("summary", {
    screen,
    cache: details.cache,
    firstContentMs: details.firstContentMs,
    apiRefreshMs: details.apiRefreshMs,
    itemCount: details.itemCount,
    emptyStateReason: details.emptyStateReason || "content_available",
    ...getPerformanceDiagnostics(),
  });
}
