import { loadRecentlyPlayed } from "../recentlyPlayedEngine";
import type { HiddenTunesStation, RadioStationListItem } from "../../types/radio";
import { toRadioStationListItem } from "./radioNormalizer";
import { readCachedRadioStations } from "./radioCache";

function stripRadioPrefix(id: string) {
  return String(id || "").replace(/^radio-/i, "").trim();
}

export async function loadRecentlyPlayedRadioItems(limit = 12) {
  const recent = await loadRecentlyPlayed();
  const radioEntries = recent.filter((entry) => String(entry.id || "").startsWith("radio-"));

  const items: RadioStationListItem[] = [];
  const stations: HiddenTunesStation[] = [];

  for (const entry of radioEntries.slice(0, limit)) {
    const stationId = stripRadioPrefix(entry.id);
    const cached =
      readCachedRadioStations("featured")?.find((station) => station.id === stationId) ||
      readCachedRadioStations(stationId)?.find((station) => station.id === stationId);

    if (cached) {
      stations.push(cached);
      items.push(toRadioStationListItem(cached));
      continue;
    }

    if (!entry.streamUrl) continue;

    const fallbackStation: HiddenTunesStation = {
      id: stationId,
      name: entry.title || "Live Station",
      streamUrl: entry.streamUrl,
      favicon:
        entry.artworkUrl ||
        entry.coverUrl ||
        entry.thumbnail ||
        undefined,
      country: undefined,
      language: undefined,
      tags: [],
      categoryId: "recent",
      cachedAt: entry.playedAt || Date.now(),
    };

    stations.push(fallbackStation);
    items.push(toRadioStationListItem(fallbackStation));
  }

  return { items, stations };
}
