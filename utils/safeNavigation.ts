import { router } from "expo-router";

import { createKeyedTapGuard } from "./tapGuard";

const navTapGuard = createKeyedTapGuard(360);
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
  const minIntervalMs = options?.minIntervalMs ?? 360;

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
