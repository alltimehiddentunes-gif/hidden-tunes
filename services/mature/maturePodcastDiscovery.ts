import {
  MATURE_DISCOVERY_PAGE_SIZE,
  MATURE_MAX_VIRTUAL_PAGES,
  MATURE_MIN_CATEGORY_RESULTS,
  MATURE_RELAXED_PODCAST_MIN_QUALITY,
} from "../../constants/matureDiscoveryFoundation";
import {
  MATURE_FALLBACK_TRIGGER_COUNT,
  MATURE_MAX_FALLBACK_QUERIES_PER_PAGE,
  MATURE_PRIMARY_QUERIES_PER_PAGE,
  DISCOVERY_QUALITY_RANK_CAP,
} from "../../constants/discoveryPerformanceBudget";
import { getMaturePodcastAdjacentGroupIds } from "../../constants/matureCategoryFallbacks";
import {
  buildMaturePodcastKeywordQuery,
  getMaturePodcastQueryGroup,
  resolveMaturePodcastQueryGroupId,
  type MaturePodcastQueryGroup,
} from "../../constants/maturePodcastQueryGroups";
import { pageFromOffset } from "../../constants/mediaDiscovery";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { logMatureDiscoveryWeakCategory } from "../../utils/matureDiscoveryDiagnostics";
import {
  fetchPodcastShows,
  type HiddenTunesPodcastShow,
} from "../podcastCatalogApi";
import {
  dedupeMaturePodcastShows,
  filterAndRankMaturePodcastShows,
} from "./matureQualityFilters";

type MaturePodcastPageResult = {
  shows: HiddenTunesPodcastShow[];
  hasMore: boolean;
  supplementaryTitles?: string[];
};

type LoadOptions = {
  forceRefresh?: boolean;
  append?: boolean;
  /** Allow adjacent-category supplement (load-more / explicit refresh only). */
  allowSparseExpansion?: boolean;
};

const inflightRequests = new Map<string, Promise<MaturePodcastPageResult>>();
let requestGeneration = 0;
const generationByKey = new Map<string, number>();
const browseAbortControllers = new Map<string, AbortController>();

function resolveQueryGroup(categoryId: string) {
  const groupId = resolveMaturePodcastQueryGroupId(categoryId);
  return getMaturePodcastQueryGroup(groupId);
}

function buildFetchPlan(group: MaturePodcastQueryGroup, virtualPage: number) {
  const keywords = group.keywords;
  const primaryIndex = virtualPage % keywords.length;
  const keywordPage = Math.floor(virtualPage / keywords.length) + 1;

  return {
    primary: { keyword: keywords[primaryIndex], page: keywordPage },
    fallback:
      MATURE_MAX_FALLBACK_QUERIES_PER_PAGE > 0 && keywords.length > 1
        ? {
            keyword: keywords[(primaryIndex + 1) % keywords.length],
            page: keywordPage,
          }
        : null,
  };
}

async function fetchMaturePodcastKeywordResponses(
  group: MaturePodcastQueryGroup,
  virtualPage: number,
  signal?: AbortSignal
) {
  const plan = buildFetchPlan(group, virtualPage);
  const primaryResponse = await fetchPodcastShows({
    ...buildMaturePodcastKeywordQuery(
      plan.primary.keyword,
      plan.primary.page,
      MATURE_DISCOVERY_PAGE_SIZE
    ),
    signal,
  });

  const responses = [primaryResponse];
  const primaryShows = primaryResponse.success ? primaryResponse.shows : [];

  if (
    plan.fallback &&
    primaryShows.length < MATURE_FALLBACK_TRIGGER_COUNT
  ) {
    const fallbackResponse = await fetchPodcastShows({
      ...buildMaturePodcastKeywordQuery(
        plan.fallback.keyword,
        plan.fallback.page,
        MATURE_DISCOVERY_PAGE_SIZE
      ),
      signal,
    });
    responses.push(fallbackResponse);
  }

  return responses;
}

async function fetchMaturePodcastBatch(
  group: MaturePodcastQueryGroup,
  virtualPage: number,
  auditCategoryId?: string,
  signal?: AbortSignal
) {
  const responses = await fetchMaturePodcastKeywordResponses(group, virtualPage, signal);
  const merged = responses.flatMap((response) => (response.success ? response.shows : []));
  const sourceHasMore = responses.some(
    (response) => response.success && response.pagination.hasMore
  );
  const ranked = filterAndRankMaturePodcastShows(
    merged.slice(0, DISCOVERY_QUALITY_RANK_CAP),
    {
      categoryId: auditCategoryId || group.id,
      source: `keywords:page${virtualPage}`,
    }
  );

  return { ranked, sourceHasMore, rawCount: merged.length };
}

async function fetchAdjacentSupplement(groupId: string, existingIds: Set<string>, maxGroups = 1) {
  const adjacentIds = getMaturePodcastAdjacentGroupIds(groupId).slice(0, maxGroups);
  let merged: HiddenTunesPodcastShow[] = [];

  for (const adjacentId of adjacentIds) {
    const adjacentGroup = getMaturePodcastQueryGroup(adjacentId);
    if (!adjacentGroup) continue;

    const { ranked } = await fetchMaturePodcastBatch(adjacentGroup, 0, `${groupId}:adjacent:${adjacentId}`);
    merged = [...merged, ...ranked.filter((show) => !existingIds.has(show.id))];
    ranked.forEach((show) => existingIds.add(show.id));
    if (merged.length >= MATURE_DISCOVERY_PAGE_SIZE) break;
  }

  return filterAndRankMaturePodcastShows(merged.slice(0, DISCOVERY_QUALITY_RANK_CAP), {
    categoryId: groupId,
    minQuality: MATURE_RELAXED_PODCAST_MIN_QUALITY,
    source: "adjacent-fallback",
  });
}

async function expandSparseMatureCategory(
  group: MaturePodcastQueryGroup,
  initialRanked: HiddenTunesPodcastShow[]
) {
  if (initialRanked.length >= MATURE_MIN_CATEGORY_RESULTS) {
    return { shows: initialRanked, supplementaryTitles: [] as string[] };
  }

  let merged = [...initialRanked];
  const seenIds = new Set(merged.map((show) => show.id));
  const supplementaryTitles: string[] = [];

  const supplement = await fetchAdjacentSupplement(group.id, seenIds, 1);
  if (supplement.length) {
    supplementaryTitles.push(
      getMaturePodcastAdjacentGroupIds(group.id)
        .slice(0, 1)
        .map((id) => getMaturePodcastQueryGroup(id)?.title || id)
        .filter(Boolean)[0] || ""
    );
  }

  merged = filterAndRankMaturePodcastShows(
    dedupeMaturePodcastShows([...merged, ...supplement]).slice(0, DISCOVERY_QUALITY_RANK_CAP),
    {
      categoryId: group.id,
      minQuality: MATURE_RELAXED_PODCAST_MIN_QUALITY,
      source: "expanded-category",
    }
  );

  logMatureDiscoveryWeakCategory("podcast", group.id, merged.length, MATURE_MIN_CATEGORY_RESULTS);

  return { shows: merged, supplementaryTitles: supplementaryTitles.filter(Boolean) };
}

export function isMaturePodcastCategory(categoryId: string) {
  return Boolean(resolveQueryGroup(categoryId));
}

export async function loadMaturePodcastCategoryPage(
  categoryId: string,
  offset = 0,
  options?: LoadOptions
): Promise<MaturePodcastPageResult> {
  if (!shouldIncludeMatureInApi()) {
    return { shows: [], hasMore: false };
  }

  const group = resolveQueryGroup(categoryId);
  if (!group) {
    return { shows: [], hasMore: false };
  }

  const virtualPage = pageFromOffset(offset, MATURE_DISCOVERY_PAGE_SIZE) - 1;
  if (virtualPage >= MATURE_MAX_VIRTUAL_PAGES) {
    return { shows: [], hasMore: false };
  }

  const requestKey = `mature-podcast:${group.id}:${virtualPage}`;
  const generation = ++requestGeneration;
  generationByKey.set(requestKey, generation);

  const inflight = inflightRequests.get(requestKey);
  if (inflight) return inflight;

  const controller = new AbortController();
  browseAbortControllers.set(requestKey, controller);

  const promise = (async () => {
    const { ranked, sourceHasMore } = await fetchMaturePodcastBatch(
      group,
      virtualPage,
      group.id,
      controller.signal
    );
    const expanded =
      options?.allowSparseExpansion && virtualPage === 0
        ? await expandSparseMatureCategory(group, ranked)
        : { shows: ranked, supplementaryTitles: [] as string[] };

    if (generationByKey.get(requestKey) !== generation) {
      return { shows: [], hasMore: false };
    }

    const shows = expanded.shows.slice(0, MATURE_DISCOVERY_PAGE_SIZE);
    const hasMore =
      virtualPage + 1 < MATURE_MAX_VIRTUAL_PAGES &&
      (sourceHasMore || expanded.shows.length >= MATURE_DISCOVERY_PAGE_SIZE);

    return {
      shows,
      hasMore,
      supplementaryTitles: expanded.supplementaryTitles,
    };
  })();

  inflightRequests.set(requestKey, promise);

  try {
    return await promise;
  } finally {
    inflightRequests.delete(requestKey);
    browseAbortControllers.delete(requestKey);
  }
}

export function cancelMaturePodcastDiscovery(requestKey?: string) {
  requestGeneration += 1;

  if (requestKey) {
    browseAbortControllers.get(requestKey)?.abort();
    browseAbortControllers.delete(requestKey);
    generationByKey.delete(requestKey);
    inflightRequests.delete(requestKey);
    return;
  }

  browseAbortControllers.forEach((controller) => controller.abort());
  browseAbortControllers.clear();
  inflightRequests.clear();
  generationByKey.clear();
}

// Preserve export for callers referencing keyword slot count.
export const MATURE_KEYWORD_SLOTS_PER_PAGE =
  MATURE_PRIMARY_QUERIES_PER_PAGE + MATURE_MAX_FALLBACK_QUERIES_PER_PAGE;
