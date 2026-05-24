import { AppState } from "react-native";

import { recordDeferredTaskScheduled } from "./playbackStressDiagnostics";

type PrewarmTask = () => void | Promise<void>;
type FastScrollListener = (isFastScrolling: boolean) => void;

const LARGE_LIST_THRESHOLD = 80;
const VERY_LARGE_LIST_THRESHOLD = 180;
const FAST_SCROLL_COOLDOWN_MS = 900;
const PREWARM_DELAY_MS = 220;
const PREWARM_TASK_LIMIT = 4;

let fastScrollingUntil = 0;
let prewarmToken = 0;
let fastScrollEndTimer: ReturnType<typeof setTimeout> | null = null;
const fastScrollListeners = new Set<FastScrollListener>();
let appIsActive = AppState.currentState === "active";

AppState.addEventListener("change", (state) => {
  appIsActive = state === "active";
  if (!appIsActive) {
    prewarmToken += 1;
  }
});

function notifyFastScrollListeners() {
  const active = isFastScrolling();
  fastScrollListeners.forEach((listener) => {
    listener(active);
  });
}

function scheduleFastScrollEndNotification() {
  if (fastScrollEndTimer) {
    clearTimeout(fastScrollEndTimer);
    fastScrollEndTimer = null;
  }

  const remainingMs = fastScrollingUntil - Date.now();
  if (remainingMs <= 0) {
    return;
  }

  fastScrollEndTimer = setTimeout(() => {
    fastScrollEndTimer = null;
    notifyFastScrollListeners();
  }, remainingMs + 16);
}

export function subscribeFastScrolling(listener: FastScrollListener) {
  fastScrollListeners.add(listener);
  listener(isFastScrolling());

  return () => {
    fastScrollListeners.delete(listener);
  };
}

export const LIST_ITEM_HEIGHTS = {
  catalogSongRow: 118,
  artistTrackRow: 78,
  genreTrackRow: 84,
  searchResultRow: 92,
  horizontalAlbumCard: 196,
  horizontalArtistCard: 168,
} as const;

export function markFastScrolling(active = true) {
  fastScrollingUntil = active ? Date.now() + FAST_SCROLL_COOLDOWN_MS : 0;

  if (fastScrollEndTimer) {
    clearTimeout(fastScrollEndTimer);
    fastScrollEndTimer = null;
  }

  notifyFastScrollListeners();

  if (active) {
    scheduleFastScrollEndNotification();
  }
}

export function isFastScrolling() {
  return Date.now() < fastScrollingUntil;
}

export function isAppActiveForWork() {
  return appIsActive;
}

export function shouldRunNonEssentialWork() {
  return appIsActive && !isFastScrolling();
}

export function getPrefetchLimit(requested = 4) {
  if (!appIsActive) return 0;
  if (isFastScrolling()) return Math.min(requested, 1);
  return requested;
}

export function getListPerformanceSettings(itemCount: number) {
  if (itemCount >= VERY_LARGE_LIST_THRESHOLD) {
    return {
      initialNumToRender: 6,
      maxToRenderPerBatch: 5,
      windowSize: 5,
      updateCellsBatchingPeriod: 120,
      removeClippedSubviews: true,
    };
  }

  if (itemCount >= LARGE_LIST_THRESHOLD) {
    return {
      initialNumToRender: 8,
      maxToRenderPerBatch: 6,
      windowSize: 7,
      updateCellsBatchingPeriod: 90,
      removeClippedSubviews: true,
    };
  }

  return {
    initialNumToRender: 10,
    maxToRenderPerBatch: 8,
    windowSize: 9,
    updateCellsBatchingPeriod: 70,
    removeClippedSubviews: true,
  };
}

export function getHorizontalListPerformanceSettings(itemCount: number) {
  if (itemCount >= 24) {
    return {
      initialNumToRender: 4,
      maxToRenderPerBatch: 4,
      windowSize: 4,
      updateCellsBatchingPeriod: 90,
      removeClippedSubviews: true,
    };
  }

  return {
    initialNumToRender: 5,
    maxToRenderPerBatch: 5,
    windowSize: 5,
    updateCellsBatchingPeriod: 70,
    removeClippedSubviews: true,
  };
}

export function getNestedSongListLayout(itemHeight: number) {
  return (_item: unknown, index: number) => ({
    length: itemHeight,
    offset: itemHeight * index,
    index,
  });
}

export function createStableKeyExtractor(prefix: string) {
  return (item: { id?: string; streamUrl?: string; url?: string }, index: number) => {
    const stableId = String(item?.id || item?.streamUrl || item?.url || "").trim();
    return stableId ? `${prefix}-${stableId}` : `${prefix}-row-${index}`;
  };
}

export function scheduleNavigationPrewarm(tasks: PrewarmTask[]) {
  recordDeferredTaskScheduled();

  prewarmToken += 1;
  const token = prewarmToken;
  const limitedTasks = tasks.slice(0, PREWARM_TASK_LIMIT);

  const timer = setTimeout(() => {
    if (token !== prewarmToken || !shouldRunNonEssentialWork()) return;

    limitedTasks.reduce<Promise<void>>(async (previous, task) => {
      await previous;
      if (token !== prewarmToken || !shouldRunNonEssentialWork()) return;
      await task();
    }, Promise.resolve());
  }, PREWARM_DELAY_MS);

  return () => {
    clearTimeout(timer);
    if (token === prewarmToken) {
      prewarmToken += 1;
    }
  };
}
