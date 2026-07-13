import { router } from "expo-router";

import { logNavigationAudit } from "./navigationAudit";

export const PRIMARY_DESTINATIONS = [
  "/music-feed",
  "/worlds",
  "/search",
  "/library",
  "/youtube-feed",
  "/profile",
] as const;

export type PrimaryDestination = (typeof PRIMARY_DESTINATIONS)[number];

const PRIMARY_SET = new Set<string>(PRIMARY_DESTINATIONS);

export function isPrimaryDestination(href: string): boolean {
  const path = href.split("?")[0];
  return PRIMARY_SET.has(path);
}

export function navigatePrimaryDestination(
  href: PrimaryDestination | string,
  options?: { source?: string; from?: string }
) {
  const path = href.split("?")[0];
  if (!PRIMARY_SET.has(path)) {
    router.push(href as any);
    return;
  }

  logNavigationAudit("bottom-nav", {
    method: "dismissAll+replace",
    from: options?.from ?? null,
    to: path,
    source: options?.source ?? "primaryNavigation",
    ts: Date.now(),
  });

  if (router.canDismiss()) router.dismissAll();
  router.replace(path as any);
}

export function navigateToRoute(
  href: string,
  options?: { source?: string; from?: string }
) {
  if (isPrimaryDestination(href)) {
    navigatePrimaryDestination(href, options);
    return;
  }

  logNavigationAudit("route-push", {
    method: "push",
    to: href,
    source: options?.source ?? "navigateToRoute",
    ts: Date.now(),
  });
  router.push(href as any);
}
