import {
  logCacheResult,
  logPerformanceSummary,
  logScreenReady,
  startPerformanceTimer,
} from "./performanceLogs";
import { markFirstCachedContentVisible } from "./startupDiagnostics";

const homePrimaryReadyLogged = { value: false };
const homeSummaryLogged = { value: false };
let lastHomePerfLogAt = 0;
const HOME_PERF_LOG_MIN_MS = 2400;

function shouldLogHomePerf() {
  return typeof __DEV__ === "undefined" || __DEV__;
}

function canLogHomePerfNow() {
  const now = Date.now();
  if (now - lastHomePerfLogAt < HOME_PERF_LOG_MIN_MS) {
    return false;
  }

  lastHomePerfLogAt = now;
  return true;
}

export function markHomePrimaryReady(
  screenStartedAt: number,
  details: {
    cache: "hit" | "miss" | "memory" | "storage";
    count: number;
    source?: string;
  }
) {
  if (!shouldLogHomePerf()) return;

  const readyMs = Date.now() - screenStartedAt;

  if (!homePrimaryReadyLogged.value) {
    homePrimaryReadyLogged.value = true;

    logScreenReady("home", screenStartedAt, {
      cache: details.cache,
      count: details.count,
      source: details.source || details.cache,
      readyMs,
      phase: "primary_catalog_visible",
    });

    if (canLogHomePerfNow()) {
      logCacheResult("home", details.cache !== "miss", {
        count: details.count,
        source: details.source,
        readyMs,
      });
    }
  }

  markFirstCachedContentVisible("home");

  if (!homeSummaryLogged.value && canLogHomePerfNow()) {
    homeSummaryLogged.value = true;
    logPerformanceSummary("home", {
      cache: details.cache,
      firstContentMs: readyMs,
      itemCount: details.count,
      emptyStateReason: "primary_catalog_visible",
      source: details.source,
    });
  }
}

export function logHomeApiRefresh(
  refreshStartedAt: number,
  details: {
    cache: "hit" | "miss";
    count: number;
    forceRefresh?: boolean;
  }
) {
  if (!shouldLogHomePerf() || !canLogHomePerfNow()) return;

  logPerformanceSummary("home", {
    cache: details.cache,
    apiRefreshMs: Date.now() - refreshStartedAt,
    itemCount: details.count,
    emptyStateReason: "content_available",
    phase: "api_refresh_complete",
    forceRefresh: details.forceRefresh,
  });
}

export function startHomePerfTimer() {
  return startPerformanceTimer();
}
