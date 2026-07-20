import { router } from "expo-router";

import { createKeyedTapGuard } from "./tapGuard";

const navTapGuard = createKeyedTapGuard(280);
let lastPushKey = "";
let lastPushAt = 0;

function routeKey(href: string | { pathname: string; params?: Record<string, string> }) {
  if (typeof href === "string") return href;
  const params = href.params
    ? Object.entries(href.params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("&")
    : "";
  return `${href.pathname}?${params}`;
}

export function safeRouterPush(
  href: string | { pathname: string; params?: Record<string, string> },
  options?: { minIntervalMs?: number; skipIfSame?: boolean }
) {
  const key = routeKey(href);
  const now = Date.now();
  const minIntervalMs = options?.minIntervalMs ?? 280;

  if (options?.skipIfSame !== false && key === lastPushKey && now - lastPushAt < minIntervalMs) {
    return false;
  }

  if (!navTapGuard(key)) {
    return false;
  }

  lastPushKey = key;
  lastPushAt = now;
  router.push(href as any);
  return true;
}

export function safeRouterReplace(
  href: string | { pathname: string; params?: Record<string, string> },
  options?: { minIntervalMs?: number }
) {
  const key = routeKey(href);
  if (!navTapGuard(key)) return false;
  lastPushKey = key;
  lastPushAt = Date.now();
  router.replace(href as any);
  return true;
}

/** True when Expo Router reports a previous screen in history. */
export function canRouterGoBack(): boolean {
  return (
    typeof (router as { canGoBack?: () => boolean }).canGoBack === "function" &&
    (router as { canGoBack: () => boolean }).canGoBack()
  );
}

/**
 * Prefer history back; otherwise replace to a section fallback.
 * Prevents Expo Router "GO_BACK was not handled" when opened cold / deep-linked.
 */
export function safeRouterBack(fallback: string = "/music-feed"): boolean {
  if (canRouterGoBack()) {
    router.back();
    return true;
  }
  router.replace(fallback as never);
  return false;
}
