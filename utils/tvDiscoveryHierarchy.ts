import type { TvCatalogQuery } from "@/services/tvCatalogApi";
import { fetchTvCatalog } from "@/services/tvCatalogApi";
import type {
  TvDiscoveryLaunchContext,
  TvHierarchyLayer,
  TvQueueItem,
} from "@/types/tvDiscovery";
import { dedupeTvQueueItems, tvVideosToQueueItems } from "@/utils/tvStationItem";

export const TV_DISCOVERY_PAGE_LIMIT = 40;
export const TV_DISCOVERY_PREFETCH_THRESHOLD = 5;

const SIMILAR_CATEGORY_MAP: Record<string, string[]> = {
  News: ["Documentary", "Education", "Government"],
  Movies: ["Entertainment", "Documentary"],
  Entertainment: ["Movies", "Music TV", "Lifestyle"],
  Sports: ["Entertainment", "News"],
  Documentary: ["News", "Education"],
  "Music TV": ["Entertainment", "Lifestyle"],
  "Faith & Worship": ["Motivation", "Lifestyle"],
  Motivation: ["Faith & Worship", "Lifestyle"],
};

function clean(value: unknown, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function uniqueLayers(layers: TvHierarchyLayer[]) {
  const seen = new Set<string>();
  const output: TvHierarchyLayer[] = [];

  for (const layer of layers) {
    const key = JSON.stringify(layer.query);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      ...layer,
      level: output.length,
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });
  }

  return output;
}

export function buildDiscoveryHierarchyLayers(
  launch: TvDiscoveryLaunchContext,
  anchor: TvQueueItem
): TvHierarchyLayer[] {
  const layers: TvHierarchyLayer[] = [];
  const category = clean(launch.originalCategory || anchor.category);
  const country = clean(launch.originalCountry || anchor.country);
  const language = clean(launch.originalLanguage || anchor.language);
  const region = clean(launch.originalRegion || anchor.region);
  const query = clean(launch.originalSearchQuery);

  if (launch.contextType === "tv-search" && query) {
    layers.push({
      level: 0,
      label: `Search: ${query}`,
      query: { q: query, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });

    const tokens = query.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      layers.push({
        level: layers.length,
        label: `Search: ${tokens[0]}`,
        query: { q: tokens[0], page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
        page: 1,
        hasMore: true,
        exhausted: false,
        loading: false,
      });
    }
  }

  if (category && country) {
    layers.push({
      level: layers.length,
      label: `${category} — ${country}`,
      query: { category, country, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });
  }

  if (category && region && region !== country) {
    layers.push({
      level: layers.length,
      label: `${category} — ${region}`,
      query: { category, country: region, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });
  }

  if (category) {
    layers.push({
      level: layers.length,
      label: category,
      query: { category, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });

    for (const similar of SIMILAR_CATEGORY_MAP[category] || []) {
      layers.push({
        level: layers.length,
        label: `Related ${similar}`,
        query: { category: similar, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
        page: 1,
        hasMore: true,
        exhausted: false,
        loading: false,
      });
    }
  }

  if (country) {
    layers.push({
      level: layers.length,
      label: `${country} stations`,
      query: { country, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });
  }

  if (region && region !== country) {
    layers.push({
      level: layers.length,
      label: `${region} stations`,
      query: { country: region, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });
  }

  if (language) {
    layers.push({
      level: layers.length,
      label: `${language} language`,
      query: { language, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });
  }

  if (launch.contextType === "tv-featured") {
    layers.push({
      level: layers.length,
      label: "Featured TV",
      query: { featured: true, page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
      page: 1,
      hasMore: true,
      exhausted: false,
      loading: false,
    });
  }

  layers.push({
    level: layers.length,
    label: "Global verified TV",
    query: { page: 1, limit: TV_DISCOVERY_PAGE_LIMIT },
    page: 1,
    hasMore: true,
    exhausted: false,
    loading: false,
  });

  const metadataMode = launch.metadataMode || anchor.metadataMode;
  return uniqueLayers(layers.map((layer) => ({ ...layer, metadataMode })));
}

export async function fetchHierarchyLayerPage(
  layer: TvHierarchyLayer,
  signal?: AbortSignal
): Promise<{ items: TvQueueItem[]; hasMore: boolean; nextPage: number }> {
  const response = await fetchTvCatalog(
    {
      ...layer.query,
      page: layer.page,
      limit: TV_DISCOVERY_PAGE_LIMIT,
    },
    { signal }
  );

  if (!response.success) {
    return { items: [], hasMore: false, nextPage: layer.page };
  }

  const items = tvVideosToQueueItems(response.videos, {
    hierarchyLevel: layer.level,
    hierarchyLabel: layer.label,
    metadataMode: layer.metadataMode || response.metadataMode,
  });

  return {
    items,
    hasMore: Boolean(response.pagination.hasMore),
    nextPage: layer.page + 1,
  };
}

export function appendHierarchyItems(
  existing: TvQueueItem[],
  incoming: TvQueueItem[],
  seen: Record<string, true>
) {
  const merged = dedupeTvQueueItems(incoming, seen);
  if (!merged.length) return existing;
  return [...existing, ...merged];
}

export function scoreRelatedStation(anchor: TvQueueItem, candidate: TvQueueItem) {
  let score = 0;

  if (anchor.broadcaster && candidate.broadcaster && anchor.broadcaster === candidate.broadcaster) {
    score += 100;
  }
  if (anchor.subcategory && candidate.subcategory === anchor.subcategory) score += 80;
  if (anchor.category && candidate.category === anchor.category) score += 60;
  if (anchor.country && candidate.country === anchor.country) score += 50;
  if (anchor.language && candidate.language === anchor.language) score += 40;
  if (anchor.region && candidate.region === anchor.region) score += 30;

  const sharedTags = anchor.tags.filter((tag) => candidate.tags.includes(tag));
  score += sharedTags.length * 10;

  if (candidate.verified) score += 8;
  score += Math.min(20, Math.floor(candidate.reliabilityScore / 5));

  return score;
}

export function sortRelatedCandidates(anchor: TvQueueItem, candidates: TvQueueItem[]) {
  return [...candidates].sort(
    (left, right) => scoreRelatedStation(anchor, right) - scoreRelatedStation(anchor, left)
  );
}
