import { useLayoutEffect } from "react";

import { getPerformanceDiagnostics, logPerformanceEvent } from "./performanceLogs";
import { getPlaybackRenderDiagnostics } from "./playbackRenderDiagnostics";
import { getPlaybackStressDiagnostics } from "./playbackStressDiagnostics";
import { getRenderDiagnostics, incrementRenderCount } from "./renderDiagnostics";

/** Dev-only Phase A verification — no production impact. */
export function isPerformanceVerificationEnabled() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

/** Audit-estimated pre–Phase A baselines for comparison. */
export const PHASE_A_BASELINE = {
  homeOpenMs: 900,
  exploreOpenMs: 850,
  searchFirstResultMs: 120,
  genreOpenMs: 700,
  tapToAudioStartMs: 450,
  playerRerendersPerPlaybackMin: 28,
  homeRerendersPerPlaybackMin: 12,
  exploreRerendersPerPlaybackMin: 10,
  searchRowsRerenderOnPlayToggle: 18,
  searchPipelinesPerKeystroke: 3,
  longJsTasksPerSession: 8,
  scrollJankWarningsPerSession: 6,
  coldStartCatalogParses: 3,
} as const;

/** Expected post–Phase A targets from audit. */
export const PHASE_A_TARGETS = {
  homeOpenMs: 750,
  exploreOpenMs: 700,
  searchFirstResultMs: 45,
  genreOpenMs: 550,
  tapToAudioStartMs: 380,
  playerRerendersPerPlaybackMin: 4,
  homeRerendersPerPlaybackMin: 4,
  exploreRerendersPerPlaybackMin: 3,
  searchRowsRerenderOnPlayToggle: 2,
  searchPipelinesPerKeystroke: 1,
  longJsTasksPerSession: 3,
  scrollJankWarningsPerSession: 3,
  coldStartCatalogParses: 1,
} as const;

type ScreenMetric = {
  screen: string;
  openMs?: number;
  firstContentMs?: number;
  updatedAt: number;
};

type SearchTiming = {
  query: string;
  firstResultMs: number;
  updatedAt: number;
};

const screenMetrics = new Map<string, ScreenMetric>();
let lastSearchTiming: SearchTiming | null = null;
let longJsTaskWarnings = 0;
let scrollJankWarnings = 0;
let longTaskMonitorActive = false;
let longTaskFrameId: number | null = null;
let lastFrameAt = 0;

function warnDev(kind: string, details: Record<string, string | number | boolean | undefined> = {}) {
  if (!isPerformanceVerificationEnabled()) return;

  console.warn(`[HiddenTunes:perf:verify] ${kind}`, details);
}

export function recordScreenOpen(
  screen: string,
  details: { openMs?: number; firstContentMs?: number } = {}
) {
  if (!isPerformanceVerificationEnabled()) return;

  const metric: ScreenMetric = {
    screen,
    openMs: details.openMs,
    firstContentMs: details.firstContentMs,
    updatedAt: Date.now(),
  };

  screenMetrics.set(screen, metric);

  logPerformanceEvent("verify_screen_open", {
    screen,
    openMs: details.openMs,
    firstContentMs: details.firstContentMs,
  });
}

export function recordSearchFirstResult(query: string, firstResultMs: number) {
  if (!isPerformanceVerificationEnabled()) return;
  if (!query.trim() || firstResultMs < 0) return;

  lastSearchTiming = {
    query: query.trim(),
    firstResultMs: Math.round(firstResultMs),
    updatedAt: Date.now(),
  };

  logPerformanceEvent("verify_search_first_result", {
    query: query.trim(),
    firstResultMs: Math.round(firstResultMs),
  });

  if (firstResultMs > PHASE_A_TARGETS.searchFirstResultMs * 2) {
    warnDev("slow_search_first_result", {
      query: query.trim(),
      firstResultMs: Math.round(firstResultMs),
      targetMs: PHASE_A_TARGETS.searchFirstResultMs,
    });
  }
}

export function recordLongJsTask(durationMs: number, source = "frame_gap") {
  if (!isPerformanceVerificationEnabled()) return;
  if (durationMs < 80) return;

  longJsTaskWarnings += 1;

  warnDev("long_js_task", {
    durationMs: Math.round(durationMs),
    source,
    totalWarnings: longJsTaskWarnings,
  });
}

export function recordScrollJank(screen: string, frameDeltaMs: number) {
  if (!isPerformanceVerificationEnabled()) return;
  if (frameDeltaMs < 48) return;

  scrollJankWarnings += 1;

  logPerformanceEvent("verify_scroll_jank", {
    screen,
    frameDeltaMs: Math.round(frameDeltaMs),
    approxFps: Math.round(1000 / frameDeltaMs),
    totalWarnings: scrollJankWarnings,
  });

  if (frameDeltaMs >= 80) {
    warnDev("scroll_fps_drop", {
      screen,
      frameDeltaMs: Math.round(frameDeltaMs),
      totalWarnings: scrollJankWarnings,
    });
  }
}

export function createScrollJankHandler(screen: string) {
  let lastScrollAt = 0;

  return () => {
    if (!isPerformanceVerificationEnabled()) return;

    const now = Date.now();
    if (lastScrollAt > 0) {
      recordScrollJank(screen, now - lastScrollAt);
    }
    lastScrollAt = now;
  };
}

export function startLongTaskMonitor() {
  if (!isPerformanceVerificationEnabled() || longTaskMonitorActive) return;

  longTaskMonitorActive = true;
  lastFrameAt = Date.now();

  const tick = () => {
    const now = Date.now();
    const gap = now - lastFrameAt;

    if (lastFrameAt > 0 && gap > 80) {
      recordLongJsTask(gap, "raf_gap");
    }

    lastFrameAt = now;
    longTaskFrameId = requestAnimationFrame(tick);
  };

  longTaskFrameId = requestAnimationFrame(tick);
}

export function stopLongTaskMonitor() {
  longTaskMonitorActive = false;

  if (longTaskFrameId !== null) {
    cancelAnimationFrame(longTaskFrameId);
    longTaskFrameId = null;
  }
}

export function useRenderCountProbe(componentName: string) {
  useLayoutEffect(() => {
    incrementRenderCount(componentName);
  });
}

function compareMetric(
  label: string,
  current: number | undefined,
  baseline: number,
  target: number,
  lowerIsBetter = true
) {
  if (current === undefined || current === 0) {
    return {
      label,
      current: null,
      baseline,
      target,
      status: "pending" as const,
    };
  }

  const improved = lowerIsBetter ? current <= target : current >= target;
  const vsBaseline = lowerIsBetter
    ? baseline - current
    : current - baseline;

  return {
    label,
    current,
    baseline,
    target,
    deltaFromBaseline: Math.round(vsBaseline),
    status: improved ? ("pass" as const) : current < baseline ? ("partial" as const) : ("fail" as const),
  };
}

export function getVerificationReport() {
  const perf = getPerformanceDiagnostics();
  const render = getRenderDiagnostics();
  const playback = getPlaybackRenderDiagnostics();
  const stress = getPlaybackStressDiagnostics();

  const homeMetric = screenMetrics.get("home");
  const exploreMetric = screenMetrics.get("explore");
  const genreMetric = screenMetrics.get("genre");
  const searchMetric = screenMetrics.get("search");

  const playerRenders = render.rerenderCounts.PlayerScreen || 0;
  const homeRenders = render.rerenderCounts.HomeScreen || 0;
  const exploreRenders = render.rerenderCounts.ExploreScreen || 0;
  const searchRenders = render.rerenderCounts.SearchScreen || 0;

  const playbackMinutes = Math.max(stress.playbackSessionDurationMs / 60_000, 0.25);
  const playerRendersPerMin = Math.round(playerRenders / playbackMinutes);
  const homeRendersPerMin = Math.round(homeRenders / playbackMinutes);
  const exploreRendersPerMin = Math.round(exploreRenders / playbackMinutes);

  return {
    enabled: isPerformanceVerificationEnabled(),
    capturedAt: Date.now(),
    screenOpens: {
      home: homeMetric?.firstContentMs ?? homeMetric?.openMs ?? perf.lastScreenReadyMs,
      explore: exploreMetric?.firstContentMs ?? exploreMetric?.openMs,
      genre: genreMetric?.firstContentMs ?? genreMetric?.openMs,
      search: searchMetric?.firstContentMs ?? searchMetric?.openMs,
    },
    searchFirstResultMs: lastSearchTiming?.firstResultMs,
    searchLastQuery: lastSearchTiming?.query,
    tapToAudioStartMs: stress.lastTapToAudioMs || stress.avgTapToAudioStartMs,
    rerenderCounts: render.rerenderCounts,
    rerendersPerMinute: {
      player: playerRendersPerMin,
      home: homeRendersPerMin,
      explore: exploreRendersPerMin,
      search: searchRenders,
    },
    playbackProgressUpdatesPerMin: playback.progressUpdatesLastMinute,
    playbackSubscriberRenders: playback.playbackSubscriberRenders,
    longJsTaskWarnings,
    scrollJankWarnings,
    comparisons: [
      compareMetric(
        "Home open (ms)",
        homeMetric?.firstContentMs ?? homeMetric?.openMs,
        PHASE_A_BASELINE.homeOpenMs,
        PHASE_A_TARGETS.homeOpenMs
      ),
      compareMetric(
        "Explore open (ms)",
        exploreMetric?.firstContentMs ?? exploreMetric?.openMs,
        PHASE_A_BASELINE.exploreOpenMs,
        PHASE_A_TARGETS.exploreOpenMs
      ),
      compareMetric(
        "Search first result (ms)",
        lastSearchTiming?.firstResultMs,
        PHASE_A_BASELINE.searchFirstResultMs,
        PHASE_A_TARGETS.searchFirstResultMs
      ),
      compareMetric(
        "Genre open (ms)",
        genreMetric?.firstContentMs ?? genreMetric?.openMs,
        PHASE_A_BASELINE.genreOpenMs,
        PHASE_A_TARGETS.genreOpenMs
      ),
      compareMetric(
        "Tap-to-audio (ms)",
        stress.lastTapToAudioMs || stress.avgTapToAudioStartMs,
        PHASE_A_BASELINE.tapToAudioStartMs,
        PHASE_A_TARGETS.tapToAudioStartMs
      ),
      compareMetric(
        "Player rerenders/min",
        playerRendersPerMin,
        PHASE_A_BASELINE.playerRerendersPerPlaybackMin,
        PHASE_A_TARGETS.playerRerendersPerPlaybackMin
      ),
      compareMetric(
        "Home rerenders/min",
        homeRendersPerMin,
        PHASE_A_BASELINE.homeRerendersPerPlaybackMin,
        PHASE_A_TARGETS.homeRerendersPerPlaybackMin
      ),
      compareMetric(
        "Explore rerenders/min",
        exploreRendersPerMin,
        PHASE_A_BASELINE.exploreRerendersPerPlaybackMin,
        PHASE_A_TARGETS.exploreRerendersPerPlaybackMin
      ),
      compareMetric(
        "Long JS tasks (>80ms)",
        longJsTaskWarnings,
        PHASE_A_BASELINE.longJsTasksPerSession,
        PHASE_A_TARGETS.longJsTasksPerSession
      ),
      compareMetric(
        "Scroll jank warnings",
        scrollJankWarnings,
        PHASE_A_BASELINE.scrollJankWarningsPerSession,
        PHASE_A_TARGETS.scrollJankWarningsPerSession
      ),
    ],
    remainingBottlenecks: [
      "Home ScrollView + nested FlatLists (virtualization ceiling)",
      "Home discovery memo chain on catalog/preference updates",
      "Home duplicate ranking work vs Explore",
      "Search network path still debounced separately from instant path",
      "usePlayerNowPlaying still pulls full PlayerStateContext",
    ],
    flashListRecommendation: "defer — pilot only if Search/Genre scroll jank persists after manual pass",
    sqliteRecommendation: "defer — catalog still fits memory index; revisit at 2k+ offline songs",
    biggestRemainingIssue: "Home ScrollView nesting + discovery CPU chain",
  };
}

export function logVerificationReport(source = "manual") {
  if (!isPerformanceVerificationEnabled()) return;

  const report = getVerificationReport();

  console.log("[HiddenTunes:perf:verify] report", {
    source,
    ...report,
  });

  return report;
}

export function resetVerificationMetrics() {
  screenMetrics.clear();
  lastSearchTiming = null;
  longJsTaskWarnings = 0;
  scrollJankWarnings = 0;
}
