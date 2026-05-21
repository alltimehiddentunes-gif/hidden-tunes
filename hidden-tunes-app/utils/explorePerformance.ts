import {
  logCacheResult,
  logPerformanceSummary,
  logScreenReady,
  startPerformanceTimer,
} from "./performanceLogs";
import { markFirstCachedContentVisible } from "./startupDiagnostics";
import { scheduleStartupTask } from "./startupScheduler";

export const EXPLORE_INITIAL_PRIMARY_SONGS = 12;
export const EXPLORE_INITIAL_RAIL_ITEMS = 4;
export const EXPLORE_TV_DELAY_MS = 4200;

const MAX_SCREEN_READY_MS = 6000;

const explorePrimaryReadyLogged = { value: false };
const exploreSummaryLogged = { value: false };
let exploreScreenSessionStartedAt: number | null = null;
let lastExplorePerfLogAt = 0;
const EXPLORE_PERF_LOG_MIN_MS = 2400;

function shouldLogExplorePerf() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

function canLogExplorePerfNow() {
  const now = Date.now();
  if (now - lastExplorePerfLogAt < EXPLORE_PERF_LOG_MIN_MS) {
    return false;
  }

  lastExplorePerfLogAt = now;
  return true;
}

function getBoundedReadyMs(screenStartedAt: number) {
  const elapsed = Date.now() - screenStartedAt;
  return Math.max(0, Math.min(MAX_SCREEN_READY_MS, elapsed));
}

export function resetExploreScreenPerfSession() {
  exploreScreenSessionStartedAt = Date.now();
  explorePrimaryReadyLogged.value = false;
}

export function getExploreScreenPerfStartedAt() {
  if (!exploreScreenSessionStartedAt) {
    resetExploreScreenPerfSession();
  }

  return exploreScreenSessionStartedAt as number;
}

export function startExplorePerfTimer() {
  resetExploreScreenPerfSession();
  return getExploreScreenPerfStartedAt();
}

export function markExplorePrimaryReady(
  screenStartedAt: number,
  details: {
    cache: "hit" | "miss" | "memory" | "storage";
    count: number;
    source?: string;
  }
) {
  if (!shouldLogExplorePerf()) return;

  const readyMs = getBoundedReadyMs(screenStartedAt);

  if (!explorePrimaryReadyLogged.value) {
    explorePrimaryReadyLogged.value = true;

    logScreenReady("explore", screenStartedAt, {
      cache: details.cache,
      count: details.count,
      source: details.source || details.cache,
      readyMs,
      phase: "primary_catalog_visible",
      bounded: readyMs < Date.now() - screenStartedAt,
    });

    if (canLogExplorePerfNow()) {
      logCacheResult("explore", details.cache !== "miss", {
        count: details.count,
        source: details.source,
        readyMs,
      });
    }
  }

  markFirstCachedContentVisible("explore");

  if (!exploreSummaryLogged.value && canLogExplorePerfNow()) {
    exploreSummaryLogged.value = true;
    logPerformanceSummary("explore", {
      cache: details.cache,
      firstContentMs: readyMs,
      itemCount: details.count,
      emptyStateReason: "primary_catalog_visible",
      source: details.source,
    });
  }
}

export function logExploreApiRefresh(
  refreshStartedAt: number,
  details: {
    cache: "hit" | "miss";
    count: number;
    forceRefresh?: boolean;
  }
) {
  if (!shouldLogExplorePerf() || !canLogExplorePerfNow()) return;

  logPerformanceSummary("explore", {
    cache: details.cache,
    apiRefreshMs: Date.now() - refreshStartedAt,
    itemCount: details.count,
    emptyStateReason: "content_available",
    phase: "api_refresh_complete",
    forceRefresh: details.forceRefresh,
  });
}

export function scheduleExploreDeferredSections(
  tasks: Array<() => void | Promise<void>>
) {
  scheduleStartupTask("background", "explore_deferred_sections_bundle", async () => {
    for (const task of tasks) {
      await task();
    }
  });
}

export function scheduleExploreTvLoad(task: () => void | Promise<void>) {
  scheduleStartupTask("background", "explore_tv_section", task);
}
