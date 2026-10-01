type TapTiming = {
  route: string;
  touchDownAt: number;
  nativeTimestamp: boolean;
  pressHandlerAt?: number;
  navigationDispatchAt?: number;
};

import { getNowPlayingSnapshot } from "./nowPlayingStore";

const debugEnabled = __DEV__ || process.env.EXPO_PUBLIC_METRO_HARNESS === "1";
const pendingByRoute = new Map<string, TapTiming>();

function enabled() {
  return debugEnabled || Boolean((globalThis as typeof globalThis & {
    __htCountIos217Tap?: (ms: number, nativeTimestamp?: boolean) => void;
  }).__htCountIos217Tap);
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function normalizeRoute(route: string): string {
  return route.split("?")[0];
}

export function markTabTouchDown(route: string, eventTimestamp?: number) {
  if (!enabled()) return;
  const observedAt = now();
  const eventAge = observedAt - Number(eventTimestamp);
  const nativeTimestamp = Number.isFinite(eventAge) && eventAge >= -5 && eventAge <= 10000;
  pendingByRoute.set(normalizeRoute(route), {
    route: normalizeRoute(route),
    touchDownAt: nativeTimestamp ? Number(eventTimestamp) : observedAt,
    nativeTimestamp,
  });
}

export function markTabPressHandler(route: string) {
  if (!enabled()) return;
  const key = normalizeRoute(route);
  const timing = pendingByRoute.get(key);
  if (timing) {
    timing.pressHandlerAt = now();
    (globalThis as typeof globalThis & {
      __htCountIos217Tap?: (ms: number, nativeTimestamp?: boolean) => void;
    }).__htCountIos217Tap?.(timing.pressHandlerAt - timing.touchDownAt, timing.nativeTimestamp);
  }
}

export function markTabNavigationDispatch(route: string) {
  if (!enabled()) return;
  const key = normalizeRoute(route);
  const timing = pendingByRoute.get(key);
  if (timing) timing.navigationDispatchAt = now();
}

export function markDestinationFirstFrame(route: string) {
  if (!enabled()) return;
  const key = normalizeRoute(route);
  const timing = pendingByRoute.get(key);
  if (!timing) return;

  if (__DEV__ || process.env.EXPO_PUBLIC_METRO_HARNESS === "1") {
    const firstFrameAt = now();
    console.log("[tap-response]", {
      route: key,
      touchDownToHandlerMs:
        timing.pressHandlerAt === undefined
          ? null
          : Math.round(timing.pressHandlerAt - timing.touchDownAt),
      touchDownToDispatchMs:
        timing.navigationDispatchAt === undefined
          ? null
          : Math.round(timing.navigationDispatchAt - timing.touchDownAt),
      touchDownToFirstFrameMs: Math.round(firstFrameAt - timing.touchDownAt),
    });
    (globalThis as typeof globalThis & {
      __htTrace?: (event: string, details?: Record<string, unknown>) => void;
    }).__htTrace?.("nav_timing", {
      status: getNowPlayingSnapshot().isPlaying ? "playing" : "idle_or_paused",
      route: key,
      touchDownToHandlerMs:
        timing.pressHandlerAt === undefined ? -1 : Math.round(timing.pressHandlerAt - timing.touchDownAt),
      touchDownToDispatchMs:
        timing.navigationDispatchAt === undefined ? -1 : Math.round(timing.navigationDispatchAt - timing.touchDownAt),
      touchDownToFirstFrameMs: Math.round(firstFrameAt - timing.touchDownAt),
    });
  }
  pendingByRoute.delete(key);
}
