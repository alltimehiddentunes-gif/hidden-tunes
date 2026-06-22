import {
  MATURE_DISCOVERY_PAGE_SIZE,
  MATURE_KEYWORDS_PER_FETCH,
  MATURE_MAX_VIRTUAL_PAGES,
  MATURE_MIN_CATEGORY_RESULTS,
  MATURE_RELAXED_PODCAST_MIN_QUALITY,
} from "../../constants/matureDiscoveryFoundation";
import { getMaturePodcastAdjacentGroupIds } from "../../constants/matureCategoryFallbacks";
import {
  buildMaturePodcastKeywordQuery,
  getMaturePodcastQueryGroup,
  resolveMaturePodcastQueryGroupId,
  type MaturePodcastQueryGroup,
} from "../../constants/maturePodcastQueryGroups";
import { pageFromOffset } from "../../constants/mediaDiscovery";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import {
  logMatureDiscoveryWeakCategory,
} from "../../utils/matureDiscoveryDiagnostics";
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

const inflightRequests = new Map<string, Promise<MaturePodcastPageResult>>();
let requestGeneration = 0;
const generationByKey = new Map<string, number>();

function resolveQueryGroup(categoryId: string) {
  const groupId = resolveMaturePodcastQueryGroupId(categoryId);
  return getMaturePodcastQueryGroup(groupId);
}

function buildFetchPlan(group: MaturePodcastQueryGroup, virtualPage: number) {
  const keywords = group.keywords;
  const startIndex = (virtualPage * MATURE_KEYWORDS_PER_FETCH) % keywords.length;
  const keywordPage =
    Math.floor((virtualPage * MATURE_KEYWORDS_PER_FETCH) / keywords.length) + 1;

  const selected: Array<{ keyword: string; page: number }> = [];
  for (let i = 0; i < MATURE_KEYWORDS_PER_FETCH; i += 1) {
    const keyword = keywords[(startIndex + i) % keywords.length];
    selected.push({ keyword, page: keywordPage });
  }

  return selected;
}

async function fetchMaturePodcastKeywordResponses(
  group: MaturePodcastQueryGroup,
  virtualPage: number
) {
  const plan = buildFetchPlan(group, virtualPage);
  return Promise.all(
    plan.map(({ keyword, page }) =>
      fetchPodcastShows(buildMaturePodcastKeywordQuery(keyword, page, MATURE_DISCOVERY_PAGE_SIZE))
    )
  );
}

async function fetchMaturePodcastBatch(
  group: MaturePodcastQueryGroup,
  virtualPage: number,
  auditCategoryId?: string
) {
  const responses = await fetchMaturePodcastKeywordResponses(group, virtualPage);
  const merged = responses.flatMap((response) => (response.success ? response.shows : []));
  const sourceHasMore = responses.some((response) => response.success && response.pagination.hasMore);
  const ranked = filterAndRankMaturePodcastShows(merged, {
    categoryId: auditCategoryId || group.id,
    source: `keywords:page${virtualPage}`,
  });

  return { ranked, sourceHasMore, rawCount: merged.length };
}

async function fetchAdjacentSupplement(
  groupId: string,
  existingIds: Set<string>,
  maxGroups = 2
) {
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

  return filterAndRankMaturePodcastShows(merged, {
    categoryId: groupId,
    minQuality: MATURE_RELAXED_PODCAST_MIN_QUALITY,
    source: "adjacent-fallback",
  });
}

async function expandSparseMatureCategory(
  group: MaturePodcastQueryGroup,
  initialRanked: HiddenTunesPodcastShow[],
  virtualPage: number
) {
  if (virtualPage !== 0 || initialRanked.length >= MATURE_MIN_CATEGORY_RESULTS) {
    return { shows: initialRanked, supplementaryTitles: [] as string[] };
  }

  let merged = [...initialRanked];
  const seenIds = new Set(merged.map((show) => show.id));
  const supplementaryTitles: string[] = [];

  if (merged.length < MATURE_MIN_CATEGORY_RESULTS) {
    const nextPage = await fetchMaturePodcastBatch(group, 1, group.id);
    for (const show of nextPage.ranked) {
      if (seenIds.has(show.id)) continue;
      seenIds.add(show.id);
      merged.push(show);
    }
    merged = filterAndRankMaturePodcastShows(merged, {
      categoryId: group.id,
      source: "secondary-keyword-page",
    });
  }

  if (merged.length < MATURE_MIN_CATEGORY_RESULTS) {
    const supplement = await fetchAdjacentSupplement(group.id, seenIds);
    if (supplement.length) {
      supplementaryTitles.push(
        ...getMaturePodcastAdjacentGroupIds(group.id)
          .slice(0, 2)
          .map((id) => getMaturePodcastQueryGroup(id)?.title || id)
          .filter(Boolean)
      );
    }
    merged = filterAndRankMaturePodcastShows(
      dedupeMaturePodcastShows([...merged, ...supplement]),
      {
        categoryId: group.id,
        minQuality: MATURE_RELAXED_PODCAST_MIN_QUALITY,
        source: "expanded-category",
      }
    );
  }

  logMatureDiscoveryWeakCategory("podcast", group.id, merged.length, MATURE_MIN_CATEGORY_RESULTS);

  return { shows: merged, supplementaryTitles };
}

export function isMaturePodcastCategory(categoryId: string) {
  return Boolean(resolveQueryGroup(categoryId));
}

export async function loadMaturePodcastCategoryPage(
  categoryId: string,
  offset = 0,
  _options?: { forceRefresh?: boolean; append?: boolean }
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

  const promise = (async () => {
    const { ranked, sourceHasMore } = await fetchMaturePodcastBatch(group, virtualPage, group.id);
    const expanded =
      virtualPage === 0
        ? await expandSparseMatureCategory(group, ranked, virtualPage)
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
  }
}

export function cancelMaturePodcastDiscovery() {
  requestGeneration += 1;
  inflightRequests.clear();
  generationByKey.clear();
}
