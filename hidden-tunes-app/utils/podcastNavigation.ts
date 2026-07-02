import { router } from "expo-router";

import { prefetchPodcastShowsForCategory } from "../services/podcastDiscoveryApi";
import type { HiddenTunesPodcastShow } from "../services/podcastCatalogApi";
import {
  createTapGuardState,
  shouldIgnoreDuplicateTap,
} from "./tapPressGuard";

const navigationTapGuard = createTapGuardState();

function guardedNavigate(tapKey: string, navigate: () => void) {
  if (shouldIgnoreDuplicateTap(navigationTapGuard, tapKey)) {
    return;
  }

  navigate();
}

/**
 * Podcast routes must keep params minimal (showId / categoryId only).
 * Long description or URL fields in query params break production deep links.
 */
export function openPodcastHome(query?: string) {
  const safeQuery = String(query || "").trim();
  if (safeQuery) {
    guardedNavigate(`podcasts:q:${safeQuery}`, () => {
      router.push({
        pathname: "/podcasts",
        params: { q: safeQuery },
      } as any);
    });
    return;
  }

  guardedNavigate("podcasts:home", () => {
    router.push("/podcasts" as any);
  });
}

export function openPodcastCategory(categoryId: string) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return;

  guardedNavigate(`podcasts:category:${safeId}`, () => {
    prefetchPodcastShowsForCategory(safeId);
    router.push({
      pathname: "/podcasts/[categoryId]",
      params: { categoryId: safeId },
    } as any);
  });
}

export function openMaturePodcastCategory(categoryId: string) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return;

  guardedNavigate(`podcasts:mature-category:${safeId}`, () => {
    router.push({
      pathname: "/podcasts/category/[id]",
      params: { id: safeId },
    } as any);
  });
}

export function openPodcastShow(
  show: Pick<HiddenTunesPodcastShow, "id"> & Partial<HiddenTunesPodcastShow>
) {
  const showId = String(show.id || "").trim();
  if (!showId) return;

  guardedNavigate(`podcasts:show:${showId}`, () => {
    router.push({
      pathname: "/podcasts/show/[showId]",
      params: { showId },
    } as any);
  });
}
