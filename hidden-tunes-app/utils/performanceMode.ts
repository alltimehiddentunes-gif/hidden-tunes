import { AppState } from "react-native";

import {
  isPlaybackStartupActive,
  shouldAllowArtworkPrefetch,
  shouldAllowNonEssentialWork,
} from "./playbackStartupGate";
import { scheduleDeferredTask } from "./deferredScheduler";

type PrewarmTask = () => void | Promise<void>;

const LARGE_LIST_THRESHOLD = 80;
const VERY_LARGE_LIST_THRESHOLD = 180;
const FAST_SCROLL_COOLDOWN_MS = 900;
const PREWARM_DELAY_MS = 220;
const PREWARM_TASK_LIMIT = 2;

let fastScrollingUntil = 0;
let prewarmToken = 0;
let appIsActive = AppState.currentState === "active";

AppState.addEventListener("change", (state) => {
  appIsActive = state === "active";
  if (!appIsActive) {
    prewarmToken += 1;
  }
});

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
}

export function isFastScrolling() {
  return Date.now() < fastScrollingUntil;
}

export function isAppActiveForWork() {
  return appIsActive;
}

export function shouldRunNonEssentialWork() {
  if (!appIsActive || isFastScrolling()) return false;

  return shouldAllowNonEssentialWork();
}

export function getPrefetchLimit(requested = 4) {
  if (!appIsActive) return 0;
  if (isPlaybackStartupActive()) return 0;
  if (!shouldAllowArtworkPrefetch()) return 0;
  if (isFastScrolling()) return Math.min(requested, 1);

  return Math.min(requested, 2);
}

const INITIAL_HOME_VISIBLE_CAP = 12;

export function getHomeNestedListSettings(itemCount: number) {
  const capped = Math.max(1, Math.min(itemCount, INITIAL_HOME_VISIBLE_CAP));

  return {
    initialNumToRender: Math.min(6, capped),
    maxToRenderPerBatch: 4,
    windowSize: 5,
    updateCellsBatchingPeriod: 100,
    removeClippedSubviews: true,
  };
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
  if (!shouldRunNonEssentialWork()) return () => {};

  prewarmToken += 1;
  const token = prewarmToken;
  const limitedTasks = tasks.slice(0, PREWARM_TASK_LIMIT);

  return scheduleDeferredTask({
    id: "navigation_prewarm_batch",
    category: "navigation",
    phase: "background",
    delayMs: PREWARM_DELAY_MS,
    task: async () => {
      if (token !== prewarmToken || !shouldRunNonEssentialWork()) return;

      for (const task of limitedTasks) {
        if (token !== prewarmToken || !shouldRunNonEssentialWork()) return;
        await task();
      }
    },
  });
}
