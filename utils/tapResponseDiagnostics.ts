type TapTiming = {
  route: string;
  touchDownAt: number;
  pressHandlerAt?: number;
  navigationDispatchAt?: number;
};

const enabled = __DEV__;
const pendingByRoute = new Map<string, TapTiming>();

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function normalizeRoute(route: string): string {
  return route.split("?")[0];
}

export function markTabTouchDown(route: string) {
  if (!enabled) return;
  pendingByRoute.set(normalizeRoute(route), {
    route: normalizeRoute(route),
    touchDownAt: now(),
  });
}

export function markTabPressHandler(route: string) {
  if (!enabled) return;
  const key = normalizeRoute(route);
  const timing = pendingByRoute.get(key);
  if (timing) timing.pressHandlerAt = now();
}

export function markTabNavigationDispatch(route: string) {
  if (!enabled) return;
  const key = normalizeRoute(route);
  const timing = pendingByRoute.get(key);
  if (timing) timing.navigationDispatchAt = now();
}

export function markDestinationFirstFrame(route: string) {
  if (!enabled) return;
  const key = normalizeRoute(route);
  const timing = pendingByRoute.get(key);
  if (!timing) return;

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
  pendingByRoute.delete(key);
}
