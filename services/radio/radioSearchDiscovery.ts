import type { RadioBrowserStationRaw } from "../../types/radio";
import type { HiddenTunesStation } from "../../types/radio";
import {
  buildRadioSearchStrategies,
  type RadioSearchStrategy,
} from "../../utils/mediaSearchQueryExpansion";
import { shouldIncludeMatureInApi } from "../../utils/matureContentSettings";
import { isMatureContentItem } from "../../types/matureContent";
import { normalizeRadioBrowserStation } from "./radioNormalizer";
import { enrichStationWithQuality, sortStationsByQuality } from "./radioQualityScore";

export type FetchRadioBrowserJson = (
  path: string,
  signal?: AbortSignal
) => Promise<RadioBrowserStationRaw[]>;

function buildStrategyPath(strategy: RadioSearchStrategy, offset: number, limit: number) {
  const safeLimit = Math.max(1, Math.min(limit, 40));
  const safeOffset = Math.max(0, offset);

  if (strategy.kind === "countrycode") {
    return `/json/stations/bycountrycodeexact/${encodeURIComponent(
      strategy.value
    )}?limit=${safeLimit}&offset=${safeOffset}&order=votes&reverse=true&hidebroken=true`;
  }

  const params = new URLSearchParams({
    limit: String(safeLimit),
    offset: String(safeOffset),
    order: "votes",
    reverse: "true",
    hidebroken: "true",
  });

  if (strategy.kind === "name") params.set("name", strategy.value);
  if (strategy.kind === "tag") params.set("tag", strategy.value);
  if (strategy.kind === "country") params.set("country", strategy.value);
  if (strategy.kind === "language") params.set("language", strategy.value);

  return `/json/stations/search?${params.toString()}`;
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

function filterMatureStations(stations: HiddenTunesStation[]) {
  if (shouldIncludeMatureInApi()) return stations;
  return stations.filter((station) => !isMatureContentItem(station));
}

function normalizeRawStations(raw: RadioBrowserStationRaw[]) {
  return dedupeRadioStations(
    raw
      .map((rawStation) => {
        const base = normalizeRadioBrowserStation(rawStation, "search");
        if (!base) return null;
        return enrichStationWithQuality(base, rawStation);
      })
      .filter((station): station is HiddenTunesStation => Boolean(station))
  );
}

export async function fetchExpandedRadioSearchPage(
  query: string,
  offset: number,
  limit: number,
  fetchRadioBrowserJson: FetchRadioBrowserJson,
  signal?: AbortSignal
) {
  const safeQuery = String(query || "").trim();
  if (!safeQuery) return [];

  if (offset > 0) {
    const raw = await fetchRadioBrowserJson(buildStrategyPath({ kind: "name", value: safeQuery }, offset, limit), signal);
    return filterMatureStations(sortStationsByQuality(normalizeRawStations(raw)).slice(0, limit));
  }

  const strategies = buildRadioSearchStrategies(safeQuery, {
    includeMature: shouldIncludeMatureInApi(),
  });

  let merged: HiddenTunesStation[] = [];

  for (const strategy of strategies) {
    if (merged.length >= limit) break;
    if (signal?.aborted) break;

    try {
      const raw = await fetchRadioBrowserJson(buildStrategyPath(strategy, 0, limit), signal);
      merged = dedupeRadioStations([...merged, ...normalizeRawStations(raw)]);
    } catch {
      // Try next strategy.
    }
  }

  return filterMatureStations(sortStationsByQuality(merged).slice(0, limit));
}
