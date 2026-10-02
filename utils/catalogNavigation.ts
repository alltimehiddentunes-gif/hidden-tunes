import { router } from "expo-router";

import type { CatalogResolverType } from "./catalogResolver";
import {
  buildCatalogViewTarget,
  ensureCatalogViewPersistenceHydrated,
  prefetchCatalogView,
} from "../services/unifiedCatalog";
import {
  setPendingGenreMoodAnchor,
} from "../services/genreAnchorHandoff";
import { scheduleNavigationPrewarm } from "./performanceMode";

export type CatalogNavigationParams = {
  id?: string;
  title?: string;
  query?: string;
  type?: CatalogResolverType;
  /** Hard genre lock when opening a mood from inside a genre session. */
  genreAnchor?: string;
};

export async function ensureCatalogNavigationReady() {
  await Promise.all([
    ensureCatalogViewPersistenceHydrated(),
  ]);
}

export function prefetchCatalogNavigation(params: CatalogNavigationParams) {
  prefetchCatalogView({
    type: params.type || "genre",
    id: params.id,
    title: params.title,
    query: params.query,
    genreAnchor: params.genreAnchor,
  });
}

export function prefetchGenreCatalogNavigation(params: CatalogNavigationParams) {
  prefetchCatalogNavigation({ ...params, type: "genre" });
}

export function scheduleCatalogNavigationPrewarm(params: CatalogNavigationParams) {
  return scheduleNavigationPrewarm([
    () => {
      void ensureCatalogNavigationReady().then(() => {
        prefetchCatalogNavigation(params);
      });
    },
  ]);
}

export function scheduleGenreCatalogPrewarm(params: CatalogNavigationParams) {
  return scheduleCatalogNavigationPrewarm({ ...params, type: params.type || "genre" });
}

function pushCatalogRoute(
  target: ReturnType<typeof buildCatalogViewTarget>,
  genreAnchor?: string
) {
  router.push({
    pathname: "/genre",
    params: {
      id: target.id,
      title: target.title,
      query: target.query,
      type: target.type,
      ...(genreAnchor ? { genreAnchor } : {}),
    },
  } as any);
}

export function openCatalogNavigation(params: CatalogNavigationParams) {
  const genreAnchor = String(params.genreAnchor || "").trim();
  const target = buildCatalogViewTarget({
    type: params.type || "category",
    id: params.id,
    title: params.title,
    query: params.query,
    genreAnchor,
  });

  prefetchCatalogNavigation({
    type: target.type,
    id: target.id,
    title: target.title,
    query: target.query,
    genreAnchor,
  });

  pushCatalogRoute(target, genreAnchor || undefined);
}

export function openGenreCatalog(params: CatalogNavigationParams) {
  openCatalogNavigation({ ...params, type: "genre", genreAnchor: undefined });
}

export function openCategoryCatalog(params: CatalogNavigationParams) {
  openCatalogNavigation({ ...params, type: params.type || "category" });
}

export function openMoodCatalog(
  title: string,
  query?: string,
  options?: { genreAnchor?: string }
) {
  const safeTitle = String(title || "").trim();
  if (!safeTitle) return;
  const genreAnchor = String(options?.genreAnchor || "").trim();

  if (genreAnchor) {
    setPendingGenreMoodAnchor({ moodTitle: safeTitle, genreAnchor });
  }

  openCatalogNavigation({
    type: "mood",
    title: safeTitle,
    query: query || `${safeTitle} music`,
    id: genreAnchor
      ? `${genreAnchor.toLowerCase()}|${safeTitle.toLowerCase()}`.replace(
          /[^a-z0-9|]+/g,
          "-"
        )
      : safeTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    genreAnchor: genreAnchor || undefined,
  });
}
