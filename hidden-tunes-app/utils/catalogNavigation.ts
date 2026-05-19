import { router } from "expo-router";

import type { CatalogResolverType } from "./catalogResolver";
import {
  buildCatalogViewTarget,
  ensureCatalogViewPersistenceHydrated,
  prefetchCatalogView,
} from "../services/unifiedCatalog";
import { scheduleNavigationPrewarm } from "./performanceMode";

export type CatalogNavigationParams = {
  id?: string;
  title?: string;
  query?: string;
  type?: CatalogResolverType;
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

function pushCatalogRoute(target: ReturnType<typeof buildCatalogViewTarget>) {
  router.push({
    pathname: "/genre",
    params: {
      id: target.id,
      title: target.title,
      query: target.query,
      type: target.type,
    },
  } as any);
}

export function openCatalogNavigation(params: CatalogNavigationParams) {
  const target = buildCatalogViewTarget({
    type: params.type || "category",
    id: params.id,
    title: params.title,
    query: params.query,
  });

  prefetchCatalogNavigation({
    type: target.type,
    id: target.id,
    title: target.title,
    query: target.query,
  });

  pushCatalogRoute(target);
}

export function openGenreCatalog(params: CatalogNavigationParams) {
  openCatalogNavigation({ ...params, type: "genre" });
}

export function openCategoryCatalog(params: CatalogNavigationParams) {
  openCatalogNavigation({ ...params, type: params.type || "category" });
}

export function openMoodCatalog(title: string, query?: string) {
  const safeTitle = String(title || "").trim();
  if (!safeTitle) return;

  openCatalogNavigation({
    type: "mood",
    title: safeTitle,
    query: query || `${safeTitle} music`,
    id: safeTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  });
}
