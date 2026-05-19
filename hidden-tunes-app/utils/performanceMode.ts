import { AppState } from "react-native";

type PrewarmTask = () => void | Promise<void>;

const LARGE_LIST_THRESHOLD = 80;
const VERY_LARGE_LIST_THRESHOLD = 180;
const FAST_SCROLL_COOLDOWN_MS = 900;
const PREWARM_DELAY_MS = 220;
const PREWARM_TASK_LIMIT = 4;

let fastScrollingUntil = 0;
let prewarmToken = 0;
let appIsActive = AppState.currentState === "active";

AppState.addEventListener("change", (state) => {
  appIsActive = state === "active";
  if (!appIsActive) {
    prewarmToken += 1;
  }
});

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

export function scheduleNavigationPrewarm(tasks: PrewarmTask[]) {
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
