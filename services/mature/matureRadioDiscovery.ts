import {
  MATURE_DISCOVERY_PAGE_SIZE,
  MATURE_MAX_VIRTUAL_PAGES,
} from "../../constants/matureDiscoveryFoundation";
import {
  DISCOVERY_QUALITY_RANK_CAP,
  MATURE_FALLBACK_TRIGGER_COUNT,
  MATURE_MAX_FALLBACK_QUERIES_PER_PAGE,
} from "../../constants/discoveryPerformanceBudget";
import {
  getMatureRadioQueryGroup,
  resolveMatureRadioQueryGroupId,
  type MatureRadioQueryGroup,
} from "../../constants/matureRadioQueryGroups";
import { pageFromOffset } from "../../constants/mediaDiscovery";
import type { HiddenTunesStation, RadioBrowserStationRaw } from "../../types/radio";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { enrichStationWithQuality } from "../radio/radioQualityScore";
import { normalizeRadioBrowserStation } from "../radio/radioNormalizer";
import { filterAndRankMatureRadioStations } from "./matureQualityFilters";

type MatureRadioPageResult = {
  stations: HiddenTunesStation[];
  hasMore: boolean;
};

const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
] as const;

const RADIO_BROWSER_USER_AGENT = "HiddenTunes/1.0 (mature radio discovery)";
const STATION_FETCH_TIMEOUT_MS = 12000;

const inflightRequests = new Map<string, Promise<MatureRadioPageResult>>();
let requestGeneration = 0;
const generationByKey = new Map<string, number>();
const browseAbortControllers = new Map<string, AbortController>();

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parentSignal = init.signal;
  const onAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onAbort);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  }
}

async function fetchRadioBrowserJson(path: string, signal?: AbortSignal) {
  let lastError: unknown = null;

  for (const server of RADIO_BROWSER_SERVERS) {
    if (signal?.aborted) {
      const error = new Error("mature_radio_aborted");
      error.name = "AbortError";
      throw error;
    }

    try {
      const response = await fetchWithTimeout(
        `${server}${path}`,
        {
          headers: {
            "User-Agent": RADIO_BROWSER_USER_AGENT,
            Accept: "application/json",
          },
          signal,
        },
        STATION_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        lastError = new Error(`mature_radio_${response.status}`);
        continue;
      }

      const text = await response.text();
      if (!text.trim().startsWith("[")) {
        lastError = new Error("mature_radio_invalid_json");
        continue;
      }

      return JSON.parse(text) as RadioBrowserStationRaw[];
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("mature_radio_failed");
}

function buildNameSearchPath(query: string, offset: number, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 40));
  const safeOffset = Math.max(0, offset);
  const safeQuery = encodeURIComponent(String(query || "").trim());
  return `/json/stations/search?name=${safeQuery}&limit=${safeLimit}&offset=${safeOffset}&order=votes&reverse=true&hidebroken=true`;
}

function buildTagSearchPath(tag: string, offset: number, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 40));
  const safeOffset = Math.max(0, offset);
  const safeTag = encodeURIComponent(String(tag || "").trim());
  return `/json/stations/search?tag=${safeTag}&limit=${safeLimit}&offset=${safeOffset}&order=votes&reverse=true&hidebroken=true`;
}

function resolveQueryGroup(categoryId: string) {
  const groupId = resolveMatureRadioQueryGroupId(categoryId);
  return getMatureRadioQueryGroup(groupId);
}

function buildFetchPlan(group: MatureRadioQueryGroup, virtualPage: number) {
  const queries = group.searchQueries;
  const startIndex = virtualPage % queries.length;
  const queryOffset = virtualPage * MATURE_DISCOVERY_PAGE_SIZE;

  const primary = {
    query: queries[startIndex],
    offset: queryOffset,
    useTag: Boolean(group.tag),
  };

  const fallback =
    MATURE_MAX_FALLBACK_QUERIES_PER_PAGE > 0 && queries.length > 1
      ? {
          query: queries[(startIndex + 1) % queries.length],
          offset: queryOffset,
          useTag: false,
        }
      : null;

  return { primary, fallback };
}

async function fetchMatureRadioBatch(
  group: MatureRadioQueryGroup,
  virtualPage: number,
  signal?: AbortSignal
) {
  const plan = buildFetchPlan(group, virtualPage);

  async function runQuery(entry: { query: string; offset: number; useTag: boolean }) {
    const path =
      entry.useTag && group.tag
        ? buildTagSearchPath(group.tag, entry.offset, MATURE_DISCOVERY_PAGE_SIZE)
        : buildNameSearchPath(entry.query, entry.offset, MATURE_DISCOVERY_PAGE_SIZE);
    return fetchRadioBrowserJson(path, signal);
  }

  const primaryBatch = await runQuery(plan.primary);
  const batches = [primaryBatch];

  if (plan.fallback && primaryBatch.length < MATURE_FALLBACK_TRIGGER_COUNT) {
    batches.push(await runQuery(plan.fallback));
  }

  const merged = batches.flatMap((rawStations) =>
    rawStations
      .map((rawStation) => {
        const base = normalizeRadioBrowserStation(rawStation, group.id);
        if (!base) return null;
        return enrichStationWithQuality(base, rawStation);
      })
      .filter((station): station is HiddenTunesStation => Boolean(station))
  );

  const ranked = filterAndRankMatureRadioStations(
    merged.slice(0, DISCOVERY_QUALITY_RANK_CAP),
    {
      categoryId: group.id,
    }
  );
  const sourceHasMore = batches.some((batch) => batch.length >= MATURE_DISCOVERY_PAGE_SIZE);

  return { ranked, sourceHasMore };
}

export function isMatureRadioCategory(categoryId: string) {
  return Boolean(resolveQueryGroup(categoryId));
}

export function cancelMatureRadioDiscovery(requestKey?: string) {
  requestGeneration += 1;

  if (requestKey) {
    browseAbortControllers.get(requestKey)?.abort();
    browseAbortControllers.delete(requestKey);
    inflightRequests.delete(requestKey);
    generationByKey.delete(requestKey);
    return;
  }

  browseAbortControllers.forEach((controller) => controller.abort());
  browseAbortControllers.clear();
  inflightRequests.clear();
  generationByKey.clear();
}

export async function loadMatureRadioCategoryPage(
  categoryId: string,
  offset = 0,
  _options?: { forceRefresh?: boolean; append?: boolean }
): Promise<MatureRadioPageResult> {
  if (!shouldIncludeMatureInApi()) {
    return { stations: [], hasMore: false };
  }

  const group = resolveQueryGroup(categoryId);
  if (!group) {
    return { stations: [], hasMore: false };
  }

  const virtualPage = pageFromOffset(offset, MATURE_DISCOVERY_PAGE_SIZE) - 1;
  if (virtualPage >= MATURE_MAX_VIRTUAL_PAGES) {
    return { stations: [], hasMore: false };
  }

  const requestKey = `mature-radio:${group.id}:${virtualPage}`;
  const generation = ++requestGeneration;
  generationByKey.set(requestKey, generation);

  const inflight = inflightRequests.get(requestKey);
  if (inflight) return inflight;

  const controller = new AbortController();
  browseAbortControllers.set(requestKey, controller);

  const promise = (async () => {
    const { ranked, sourceHasMore } = await fetchMatureRadioBatch(
      group,
      virtualPage,
      controller.signal
    );

    if (generationByKey.get(requestKey) !== generation) {
      return { stations: [], hasMore: false };
    }

    const stations = ranked.slice(0, MATURE_DISCOVERY_PAGE_SIZE);
    const hasMore =
      virtualPage + 1 < MATURE_MAX_VIRTUAL_PAGES &&
      (sourceHasMore || ranked.length >= MATURE_DISCOVERY_PAGE_SIZE);

    return { stations, hasMore };
  })();

  inflightRequests.set(requestKey, promise);

  try {
    return await promise;
  } finally {
    browseAbortControllers.delete(requestKey);
    inflightRequests.delete(requestKey);
  }
}
