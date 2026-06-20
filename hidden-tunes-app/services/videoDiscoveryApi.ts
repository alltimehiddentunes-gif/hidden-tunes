import { fetchTvCatalog, type HiddenTunesTvVideo } from "./tvCatalogApi";
import { getLaunchVideoCategory } from "../utils/launchVideoCategories";
import {
  getVideoDiscoveryInflight,
  hydrateCachedVideos,
  readCachedVideos,
  setVideoDiscoveryInflight,
  writeCachedVideos,
} from "../utils/videoDiscoveryCache";

const VIDEO_PAGE_LIMIT = 28;

function dedupeVideos(videos: HiddenTunesTvVideo[]) {
  const seenIds = new Set<string>();
  const seenSources = new Set<string>();
  const deduped: HiddenTunesTvVideo[] = [];

  for (const video of videos) {
    if (seenIds.has(video.id)) continue;

    const sourceKey = String(video.source_id || "").trim().toLowerCase();
    if (sourceKey && seenSources.has(sourceKey)) continue;

    seenIds.add(video.id);
    if (sourceKey) seenSources.add(sourceKey);
    deduped.push(video);
  }

  return deduped;
}

async function fetchVideosFromNetwork(categoryId: string) {
  const category = getLaunchVideoCategory(categoryId);
  if (!category) return [];

  const primary = await fetchTvCatalog({
    ...category.catalogQuery,
    page: category.catalogQuery.page || 1,
    limit: VIDEO_PAGE_LIMIT,
  });

  let videos = primary.success ? primary.videos : [];

  if (!videos.length && category.fallbackQuery) {
    const fallback = await fetchTvCatalog({
      ...category.fallbackQuery,
      page: category.fallbackQuery.page || 1,
      limit: VIDEO_PAGE_LIMIT,
    });
    if (fallback.success) {
      videos = fallback.videos;
    }
  }

  return dedupeVideos(videos);
}

export async function getVideosForCategory(
  categoryId: string,
  options?: { forceRefresh?: boolean }
) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return [];

  if (!options?.forceRefresh) {
    const memoryHit = readCachedVideos(safeId);
    if (memoryHit?.length) return memoryHit;

    const inflight = getVideoDiscoveryInflight(safeId);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedVideos(safeId);
    if (storageHit?.length) return storageHit;
  }

  const fetchPromise = fetchVideosFromNetwork(safeId)
    .then((videos) => {
      writeCachedVideos(safeId, videos);
      return videos;
    })
    .catch(async () => {
      const memoryStale = readCachedVideos(safeId);
      if (memoryStale?.length) return memoryStale;
      return (await hydrateCachedVideos(safeId)) || [];
    });

  return setVideoDiscoveryInflight(safeId, fetchPromise);
}

export function prefetchVideosForCategory(categoryId: string) {
  if (readCachedVideos(categoryId)?.length) return;
  void getVideosForCategory(categoryId).catch(() => {});
}
