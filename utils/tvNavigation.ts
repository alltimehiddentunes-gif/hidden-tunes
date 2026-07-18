import { router } from "expo-router";

import { getTvDiscoverySession } from "@/services/tvDiscoverySessionStore";
import { navigatePrimaryDestination } from "@/utils/primaryNavigation";

/** TV section root — only this screen exits to Main App Home. */
export const TV_HOME_ROUTE = "/youtube-feed";

/** Main App Home — destination when leaving the TV section. */
export const TV_EXIT_HOME_ROUTE = "/music-feed";

const NON_TV_EXIT_PATHS = new Set([
  TV_EXIT_HOME_ROUTE,
  "/library",
  "/profile",
  "/worlds",
  "/tv-player",
  "/youtube-player",
]);

function canNavigateBack(): boolean {
  return (
    typeof (router as { canGoBack?: () => boolean }).canGoBack === "function" &&
    (router as { canGoBack: () => boolean }).canGoBack()
  );
}

function normalizeReturnPath(raw: string | null | undefined): string {
  const path = String(raw || "")
    .trim()
    .split("?")[0];
  if (!path.startsWith("/")) return TV_HOME_ROUTE;
  if (NON_TV_EXIT_PATHS.has(path)) return TV_HOME_ROUTE;
  return path;
}

/**
 * Resolve the recorded TV browse parent for player / subpage back.
 * Defaults to TV Home. Never returns Main App Home.
 */
export function resolveTvBrowseReturnPath(
  explicit?: string | null
): string {
  const fromSession =
    getTvDiscoverySession()?.originalContext.browseReturnPath || null;
  return normalizeReturnPath(explicit || fromSession || TV_HOME_ROUTE);
}

/**
 * Exit the TV section from TV Home only.
 * Always goes to Main App Home — never history / Library / Profile / Search.
 */
export function navigateTvHomeBack(): void {
  navigatePrimaryDestination(TV_EXIT_HOME_ROUTE, {
    source: "tv-home-back",
    from: TV_HOME_ROUTE,
  });
}

/**
 * Stay inside TV: prefer history, else replace to TV Home.
 * Never falls through to Main App Home.
 */
export function navigateWithinTv(
  fallback: string = TV_HOME_ROUTE
): void {
  if (canNavigateBack()) {
    router.back();
    return;
  }
  router.replace(normalizeReturnPath(fallback) as never);
}

/**
 * TV player / full-screen back after PiP minimize.
 * Honors browseReturnPath (e.g. Global Search → "/search").
 * No-history fallback is always TV Home — never Main App Home.
 */
export function navigateTvPlayerBack(
  browseReturnPath?: string | null
): void {
  const target = resolveTvBrowseReturnPath(browseReturnPath);

  // Explicit non-TV-home parents (Global Search, etc.) — always honor.
  if (target !== TV_HOME_ROUTE) {
    router.replace(target as never);
    return;
  }

  // Recorded TV parent: prefer history so in-page TV search/category state survives.
  if (canNavigateBack()) {
    router.back();
    return;
  }

  router.replace(TV_HOME_ROUTE as never);
}
