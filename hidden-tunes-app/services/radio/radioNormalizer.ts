import {
  sanitizeStationTagsForDisplay,
  type HiddenTunesStation,
} from "../radioStationApi";
import type { RadioStation } from "../../types/radio";

export function normalizeRadioStation(station: HiddenTunesStation): RadioStation {
  const tags = sanitizeStationTagsForDisplay(station.tags || []);

  return {
    id: station.id,
    title: station.name,
    streamUrl: station.streamUrl,
    artworkUrl: station.favicon,
    country: station.country,
    tags,
    genre: tags[0],
    source: "radio",
  };
}
