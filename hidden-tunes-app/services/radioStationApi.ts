import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import {
  getLaunchRadioCategory,
  type LaunchRadioCategory,
} from "../utils/launchRadioCategories";
import {
  getRadioStationInflight,
  hydrateCachedRadioStations,
  readCachedRadioStations,
  setRadioStationInflight,
  writeCachedRadioStations,
} from "../utils/radioStationCache";

export type HiddenTunesStation = {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  language?: string;
  tags: string[];
  bitrate?: number;
  codec?: string;
  sourceName: "Hidden Tunes";
  categoryId: string;
  cachedAt: number;
};

const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
] as const;

const RADIO_BROWSER_USER_AGENT = "HiddenTunes/1.0 (launch radio browser)";
const STATION_FETCH_TIMEOUT_MS = 12000;
const STATION_PAGE_LIMIT = 28;

type RadioBrowserStation = {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  favicon?: string;
  country?: string;
  countrycode?: string;
  language?: string;
  tags?: string;
  bitrate?: number;
  codec?: string;
  votes?: number;
  clickcount?: number;
};

const HIDDEN_PROVIDER_TAG =
  /^(radio[- ]?browser|icecast|shoutcast|radionomy|tunein|streema|live365)$/i;

function normalizeTags(value: unknown) {
  return sanitizeStationTagsForDisplay(
    String(value || "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
  ).slice(0, 8);
}

export function sanitizeStationTagsForDisplay(tags: string[]) {
  return tags.filter((tag) => !HIDDEN_PROVIDER_TAG.test(String(tag || "").trim()));
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

function pickStreamUrl(station: RadioBrowserStation) {
  const candidate = String(station.url_resolved || station.url || "").trim();
  if (!candidate.startsWith("https://")) return "";
  return candidate;
}

function buildStationId(station: RadioBrowserStation) {
  return String(station.stationuuid || station.name || "")
    .trim()
    .toLowerCase();
}

export function normalizeRadioBrowserStation(
  station: RadioBrowserStation,
  categoryId: string
): HiddenTunesStation | null {
  const id = buildStationId(station);
  const streamUrl = pickStreamUrl(station);
  const name = String(station.name || "").trim();

  if (!id || !name || !streamUrl) return null;

  return {
    id,
    name,
    streamUrl,
    favicon: String(station.favicon || "").trim() || undefined,
    country: String(station.countrycode || station.country || "")
      .trim()
      .toUpperCase()
      .slice(0, 2) || undefined,
    language: String(station.language || "").trim() || undefined,
    tags: normalizeTags(station.tags),
    bitrate: Number.isFinite(Number(station.bitrate))
      ? Number(station.bitrate)
      : undefined,
    codec: String(station.codec || "").trim() || undefined,
    sourceName: "Hidden Tunes",
    categoryId,
    cachedAt: Date.now(),
  };
}

function buildCategoryPath(category: LaunchRadioCategory) {
  if (category.useTopVotes) {
    return `/json/stations/topvote/${STATION_PAGE_LIMIT}`;
  }

  if (category.countryCode) {
    return `/json/stations/bycountrycodeexact/${encodeURIComponent(
      category.countryCode
    )}?limit=${STATION_PAGE_LIMIT}&order=votes&reverse=true`;
  }

  const tag = encodeURIComponent(String(category.tag || category.id));
  return `/json/stations/search?tag=${tag}&limit=${STATION_PAGE_LIMIT}&order=votes&reverse=true&hidebroken=true`;
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

      return JSON.parse(text) as RadioBrowserStation[];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("radio_browser_failed");
}

async function fetchStationsFromNetwork(categoryId: string) {
  const category = getLaunchRadioCategory(categoryId);
  if (!category) return [];

  const raw = await fetchRadioBrowserJson(buildCategoryPath(category));

  return dedupeRadioStations(
    raw
      .map((station) => normalizeRadioBrowserStation(station, category.id))
      .filter((station): station is HiddenTunesStation => Boolean(station))
  );
}

export async function getRadioStationsForCategory(
  categoryId: string,
  options?: { forceRefresh?: boolean }
) {
  const safeId = String(categoryId || "").trim();
  if (!safeId) return [];

  if (!options?.forceRefresh) {
    const memoryHit = readCachedRadioStations(safeId);
    if (memoryHit?.length) return memoryHit;

    const inflight = getRadioStationInflight(safeId);
    if (inflight) return inflight;

    const storageHit = await hydrateCachedRadioStations(safeId);
    if (storageHit?.length) return storageHit;
  }

  const fetchPromise = fetchStationsFromNetwork(safeId)
    .then((stations) => {
      writeCachedRadioStations(safeId, stations);
      return stations;
    })
    .catch(async () => {
      const memoryStale = readCachedRadioStations(safeId);
      if (memoryStale?.length) return memoryStale;
      return (await hydrateCachedRadioStations(safeId)) || [];
    });

  return setRadioStationInflight(safeId, fetchPromise);
}

export function prefetchRadioStationsForCategory(categoryId: string) {
  if (readCachedRadioStations(categoryId)?.length) return;
  void getRadioStationsForCategory(categoryId).catch(() => {});
}
