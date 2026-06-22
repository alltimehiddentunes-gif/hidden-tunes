import {
  MATURE_DISCOVERY_PAGE_SIZE,
  MATURE_KEYWORDS_PER_FETCH,
  MATURE_MAX_VIRTUAL_PAGES,
} from "../../constants/matureDiscoveryFoundation";
import {
  buildMaturePodcastKeywordQuery,
  getMaturePodcastQueryGroup,
  resolveMaturePodcastQueryGroupId,
  type MaturePodcastQueryGroup,
} from "../../constants/maturePodcastQueryGroups";
import { pageFromOffset } from "../../constants/mediaDiscovery";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import {
  fetchPodcastShows,
  type HiddenTunesPodcastShow,
} from "../podcastCatalogApi";
import { filterAndRankMaturePodcastShows } from "./matureQualityFilters";

type MaturePodcastPageResult = {
  shows: HiddenTunesPodcastShow[];
  hasMore: boolean;
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

async function fetchMaturePodcastBatch(group: MaturePodcastQueryGroup, virtualPage: number) {
  const plan = buildFetchPlan(group, virtualPage);
  const responses = await Promise.all(
    plan.map(({ keyword, page }) =>
      fetchPodcastShows(buildMaturePodcastKeywordQuery(keyword, page, MATURE_DISCOVERY_PAGE_SIZE))
    )
  );

  const merged = responses.flatMap((response) => (response.success ? response.shows : []));
  const sourceHasMore = responses.some((response) => response.success && response.pagination.hasMore);
  const ranked = filterAndRankMaturePodcastShows(merged);

  return { ranked, sourceHasMore };
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
    const { ranked, sourceHasMore } = await fetchMaturePodcastBatch(group, virtualPage);

    if (generationByKey.get(requestKey) !== generation) {
      return { shows: [], hasMore: false };
    }

    const shows = ranked.slice(0, MATURE_DISCOVERY_PAGE_SIZE);
    const hasMore =
      virtualPage + 1 < MATURE_MAX_VIRTUAL_PAGES &&
      (sourceHasMore || ranked.length >= MATURE_DISCOVERY_PAGE_SIZE);

    return { shows, hasMore };
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
