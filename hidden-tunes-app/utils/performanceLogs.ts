import { getHomeRenderDiagnostics } from "./homeRenderDiagnostics";
import { getDeferredSchedulerMetrics } from "./deferredScheduler";
import {
  getPlaybackStartupBreakdownDiagnostics,
  primePlaybackTapReceived,
} from "./playbackStartupProfiling";
import { getPlaybackRenderDiagnostics } from "./playbackRenderDiagnostics";
import { getPlaybackStressDiagnostics } from "./playbackStressDiagnostics";
import { getRenderDiagnostics } from "./renderDiagnostics";
import { getStartupDiagnostics } from "./startupDiagnostics";
import { logPerformanceEvent, nowMs } from "./performanceEvents";

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
const artworkFailureCooldown = new Map<string, number>();
const ARTWORK_FAILURE_COOLDOWN_MS = 8000;
let lastDiagnosticsOverlayLogAt = 0;
const DIAGNOSTICS_OVERLAY_MIN_MS = 4500;

function shouldLogPerformance() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

export { nowMs };

export function startPerformanceTimer() {
  return nowMs();
}

const MAX_SCREEN_READY_MS = 6000;

export function logScreenReady(
  screen: string,
  startedAt: number,
  details: PerformanceLogDetails = {}
) {
  const elapsed = nowMs() - startedAt;
  const readyMs = Math.max(0, Math.min(MAX_SCREEN_READY_MS, elapsed));
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

export function recordArtworkFailure(details: PerformanceLogDetails = {}) {
  const cooldownKey = String(details.uri || details.recyclingKey || "global");
  const now = nowMs();
  const lastFailureAt = artworkFailureCooldown.get(cooldownKey) || 0;

  if (now - lastFailureAt < ARTWORK_FAILURE_COOLDOWN_MS) {
    return;
  }

  artworkFailureCooldown.set(cooldownKey, now);
  metrics.artworkFailures += 1;

  logPerformanceEvent("artwork_failure", {
    ...details,
    cooldownKey,
  });
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
  const homeDiagnostics = getHomeRenderDiagnostics();
  const tapBreakdown = getPlaybackStartupBreakdownDiagnostics();
  const scheduler = getDeferredSchedulerMetrics();

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
    startupScheduledTasks: scheduler.scheduledDeferred,
    startupPlaybackRestoreMs: startupDiagnostics.playbackRestoreMs ?? undefined,
    avgTapToAudioStartMs: stressDiagnostics.avgTapToAudioStartMs,
    avgNextTrackTransitionMs: stressDiagnostics.avgNextTrackTransitionMs,
    avgPauseResumeMs: stressDiagnostics.avgPauseResumeMs,
    playbackSessionMinutes: stressDiagnostics.playbackSessionDurationMs
      ? Math.round(stressDiagnostics.playbackSessionDurationMs / 60000)
      : 0,
    artworkPrefetchLoaded: stressDiagnostics.artworkPrefetchSuccesses,
    activeDeferredTasks: scheduler.activeDeferred,
    scheduledDeferredTasks: scheduler.scheduledDeferred,
    schedulerQueueDepth: scheduler.schedulerQueueDepth,
    categoryCountsArtwork: scheduler.categoryCounts.artwork,
    categoryCountsStartup: scheduler.categoryCounts.startup,
    categoryCountsRanking: scheduler.categoryCounts.ranking,
    categoryCountsTv: scheduler.categoryCounts.tv,
    categoryCountsPreload: scheduler.categoryCounts.preload,
    categoryCountsDiagnostics: scheduler.categoryCounts.diagnostics,
    categoryCountsNavigation: scheduler.categoryCounts.navigation,
    dedupedTasks: scheduler.dedupedTasks,
    cancelledTasks: scheduler.cancelledTasks,
    staleTaskClears: scheduler.staleTaskClears,
    queueTortureWarnings: stressDiagnostics.queueTortureWarnings,
    audioReloadWindowCount: stressDiagnostics.audioReloadCountWindow,
    offlineCacheStartups: stressDiagnostics.offlineCacheStartupSuccesses,
    stressWarningCount: stressDiagnostics.stressWarnings.length,
    avgSourceResolutionMs: stressDiagnostics.avgSourceResolutionMs,
    avgAudioObjectCreateMs: stressDiagnostics.avgAudioObjectCreateMs,
    avgPlaybackBeginMs: stressDiagnostics.avgPlaybackBeginMs,
    deferredTaskRejected: stressDiagnostics.deferredTaskRejected,
    deferredPauseDuringPlayback: stressDiagnostics.deferredPauseDuringPlayback,
    startupTaskPressure: stressDiagnostics.startupTaskPressure,
    deferredRunning: stressDiagnostics.deferredRunning,
    homeRerenderCount: homeDiagnostics.homeRerenderCount,
    stabilizedRowCount: homeDiagnostics.stabilizedRowCount,
    memoizedRowCount: homeDiagnostics.memoizedRowCount,
    requireCycleResolvedCount: homeDiagnostics.requireCycleResolvedCount,
    ...tapBreakdown,
  };
}

export function logPerformanceDiagnosticsOverlay(screen = "global") {
  if (!shouldLogPerformance()) return;

  const now = nowMs();
  if (now - lastDiagnosticsOverlayLogAt < DIAGNOSTICS_OVERLAY_MIN_MS) {
    return;
  }

  lastDiagnosticsOverlayLogAt = now;

  logPerformanceEvent("diagnostics_overlay", {
    screen,
    ...getPerformanceDiagnostics(),
  });
}

export function beginUserTapToPlay(
  screen: string,
  songId?: string,
  details: PerformanceLogDetails = {}
) {
  const tapReceivedAt = startPerformanceTimer();

  primePlaybackTapReceived(tapReceivedAt, {
    screen,
    songId,
    source: screen,
    ...details,
  });

  return tapReceivedAt;
}

export function logTapToPlay(
  screen: string,
  startedAt: number,
  details: PerformanceLogDetails = {}
) {
  logPerformanceEvent("tap_to_play", {
    screen,
    tapToPlayMs: nowMs() - startedAt,
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

  const { cache, firstContentMs, apiRefreshMs, itemCount, emptyStateReason, ...rest } =
    details;

  logPerformanceEvent("summary", {
    screen,
    cache,
    firstContentMs,
    apiRefreshMs,
    itemCount,
    emptyStateReason: emptyStateReason || "content_available",
    ...rest,
  });
}
