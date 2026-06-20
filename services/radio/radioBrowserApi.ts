import { getRadioCategory, type RadioCategory } from "../../constants/radioCategories";
import type { HiddenTunesStation, RadioBrowserStationRaw } from "../../types/radio";
import { normalizeRadioBrowserStation } from "./radioNormalizer";
import {
  getRadioStationInflight,
  hydrateCachedRadioStations,
  readCachedRadioStations,
  setRadioStationInflight,
  writeCachedRadioStations,
} from "./radioCache";

const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
] as const;

const RADIO_BROWSER_USER_AGENT = "HiddenTunes/1.0 (mobile radio browser)";
const STATION_FETCH_TIMEOUT_MS = 12000;

export const RADIO_STATION_PAGE_SIZE = 32;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildCategoryPath(category: RadioCategory, offset: number, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 40));
  const safeOffset = Math.max(0, offset);

  if (category.useTopVotes) {
    return `/json/stations/topvote/${safeLimit + safeOffset}`;
  }

  if (category.countryCode) {
    return `/json/stations/bycountrycodeexact/${encodeURIComponent(
      category.countryCode
    )}?limit=${safeLimit}&offset=${safeOffset}&order=votes&reverse=true&hidebroken=true`;
  }

  const tag = encodeURIComponent(String(category.tag || category.id));
  return `/json/stations/search?tag=${tag}&limit=${safeLimit}&offset=${safeOffset}&order=votes&reverse=true&hidebroken=true`;
}

async function fetchRadioBrowserJson(path: string) {
  let lastError: unknown = null;

  for (const server of RADIO_BROWSER_SERVERS) {
    try {
      const response = await fetchWithTimeout(
        `${server}${path}`,
        {
          headers: {
            "User-Agent": RADIO_BROWSER_USER_AGENT,
            Accept: "application/json",
          },
        },
        STATION_FETCH_TIMEOUT_MS
      );

      if (!response.ok) {
        lastError = new Error(`radio_browser_${response.status}`);
        continue;
      }

      const text = await response.text();
      if (!text.trim().startsWith("[")) {
        lastError = new Error("radio_browser_invalid_json");
        continue;
      }

      return JSON.parse(text) as RadioBrowserStationRaw[];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("radio_browser_failed");
}

function dedupeRadioStations(stations: HiddenTunesStation[]) {
  const seenIds = new Set<string>();
  const seenStreams = new Set<string>();
  const deduped: HiddenTunesStation[] = [];

  for (const station of stations) {
    if (seenIds.has(station.id)) continue;
    const streamKey = station.streamUrl.trim().toLowerCase();
    if (seenStreams.has(streamKey)) continue;
    seenIds.add(station.id);
    seenStreams.add(streamKey);
    deduped.push(station);
  }

  return deduped;
}

export async function fetchRadioStationsPage(
  categoryId: string,
  offset = 0,
  limit = RADIO_STATION_PAGE_SIZE
) {
  const category = getRadioCategory(categoryId);
  if (!category) return [];

  const raw = await fetchRadioBrowserJson(buildCategoryPath(category, offset, limit));

  let normalized = dedupeRadioStations(
    raw
      .map((station) => normalizeRadioBrowserStation(station, category.id))
      .filter((station): station is HiddenTunesStation => Boolean(station))
  );

  if (category.useTopVotes && offset > 0) {
    normalized = normalized.slice(offset);
  }

  return normalized.slice(0, limit);
}

export async function loadRadioStationsForCategory(
  categoryId: string,
  options?: {
    offset?: number;
    limit?: number;
    forceRefresh?: boolean;
    append?: boolean;
  }
) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return { stations: [] as HiddenTunesStation[], hasMore: false };

  const offset = Math.max(0, Number(options?.offset) || 0);
  const limit = Math.max(1, Math.min(Number(options?.limit) || RADIO_STATION_PAGE_SIZE, 40));
  const append = Boolean(options?.append);

  if (!options?.forceRefresh && offset === 0 && !append) {
    const memoryHit = readCachedRadioStations(safeId);
    if (memoryHit?.length) {
      return { stations: memoryHit, hasMore: memoryHit.length >= limit };
    }

    const inflight = getRadioStationInflight(safeId);
    if (inflight) {
      const stations = await inflight;
      return { stations, hasMore: stations.length >= limit };
    }

    const storageHit = await hydrateCachedRadioStations(safeId);
    if (storageHit?.length) {
      return { stations: storageHit, hasMore: storageHit.length >= limit };
    }
  }

  const fetchPromise = fetchRadioStationsPage(safeId, offset, limit)
    .then((page) => {
      const merged = writeCachedRadioStations(safeId, page, { append });
      return merged;
    })
    .catch(async () => {
      const cached = readCachedRadioStations(safeId) || (await hydrateCachedRadioStations(safeId));
      return cached || [];
    });

  if (offset === 0 && !append && !options?.forceRefresh) {
    setRadioStationInflight(safeId, fetchPromise);
  }

  const stations = await fetchPromise;
  const pageCount = append
    ? stations.length - offset
    : Math.min(stations.length, limit);

  return {
    stations,
    hasMore: pageCount >= limit,
  };
}
