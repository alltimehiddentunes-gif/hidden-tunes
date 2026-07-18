import type { HiddenTunesStation, RadioStation, RadioStationListItem } from "../../types/radio";
import { normalizeRadioStation } from "./radioNormalizer";
import type { LiveRadioSessionOptions } from "./radioPlaybackSession";

export function buildRadioSessionFromResolvedStations(
  stations: (HiddenTunesStation | RadioStation | null | undefined)[],
  options?: Omit<LiveRadioSessionOptions, "session" | "startIndex"> & {
    startStationId?: string;
  }
): LiveRadioSessionOptions {
  const session: RadioStation[] = [];
  const seen = new Set<string>();

  for (const entry of stations) {
    if (!entry) continue;
    const station =
      "streamUrl" in entry && "title" in entry && entry.source === "radio"
        ? (entry as RadioStation)
        : normalizeRadioStation(entry as HiddenTunesStation);
    const id = String(station.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    session.push(station);
  }

  const startStationId = String(options?.startStationId || "").trim();
  const startIndex = startStationId
    ? Math.max(
        0,
        session.findIndex((station) => station.id === startStationId)
      )
    : 0;

  return {
    session,
    startIndex: session.length ? startIndex : 0,
    label: options?.label,
    cacheKey: options?.cacheKey,
    searchQuery: options?.searchQuery,
  };
}

export function buildRadioSessionFromListItems(
  listItems: RadioStationListItem[],
  resolveStation: (id: string) => HiddenTunesStation | null | undefined,
  options?: Omit<LiveRadioSessionOptions, "session" | "startIndex"> & {
    startStationId?: string;
  }
): LiveRadioSessionOptions {
  const stations = listItems.map((item) => resolveStation(item.id));
  return buildRadioSessionFromResolvedStations(stations, options);
}
