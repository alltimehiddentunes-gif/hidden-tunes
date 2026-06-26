import { DISCOVERY_QUALITY_RANK_CAP } from "../../constants/discoveryPerformanceBudget";
import type { HiddenTunesStation } from "../../types/radio";
import { MATURE_RADIO_MIN_QUALITY } from "../../constants/matureDiscoveryFoundation";
import { sortStationsByQuality } from "../radio/radioQualityScore";
import {
  logMatureRadioCategoryAudit,
  type MatureRadioAuditCounts,
} from "../../utils/matureDiscoveryDiagnostics";

const SPAM_KEYWORD_PATTERN =
  /\b(free download|click here|subscribe now|best podcast ever|#1 podcast|crypto|nft|viagra|casino|betting)\b/i;

const KEYWORD_STUFFING_PATTERN = /(\b\w+\b)(?:\s+\1){3,}/i;

export function isSpamDiscoveryText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return false;
  return SPAM_KEYWORD_PATTERN.test(text) || KEYWORD_STUFFING_PATTERN.test(text);
}

export function passesMatureRadioQualityGate(
  station: HiddenTunesStation,
  minQuality = MATURE_RADIO_MIN_QUALITY
) {
  const name = String(station.name || "").trim();
  if (!name || name.length < 2) return false;
  if (isSpamDiscoveryText(name)) return false;
  const streamUrl = String(station.streamUrl || "").trim();
  if (!streamUrl.startsWith("https://")) return false;
  return (station.quality_score || 0) >= minQuality;
}

export function dedupeMatureRadioStations(stations: HiddenTunesStation[]) {
  const seenIds = new Set<string>();
  const seenStreams = new Set<string>();
  const deduped: HiddenTunesStation[] = [];

  for (const station of stations) {
    if (seenIds.has(station.id)) continue;
    const streamKey = String(station.streamUrl || "").trim().toLowerCase();
    if (streamKey && seenStreams.has(streamKey)) continue;
    seenIds.add(station.id);
    if (streamKey) seenStreams.add(streamKey);
    deduped.push(station);
  }

  return deduped;
}

export function filterAndRankMatureRadioStations(
  stations: HiddenTunesStation[],
  options?: { minQuality?: number; categoryId?: string }
) {
  const minQuality = options?.minQuality ?? MATURE_RADIO_MIN_QUALITY;
  const capped = stations.slice(0, DISCOVERY_QUALITY_RANK_CAP);
  const deduped = dedupeMatureRadioStations(capped);
  const playableStreams = deduped.filter((station) =>
    String(station.streamUrl || "").trim().startsWith("https://")
  );
  const httpsStreams = playableStreams.length;
  const filtered = playableStreams
    .filter((station) => passesMatureRadioQualityGate(station, minQuality))
    .map((station) => ({
      ...station,
      is_mature: true,
      content_rating:
        station.content_rating && station.content_rating !== "clean"
          ? station.content_rating
          : ("adult" as const),
    }));

  if (options?.categoryId) {
    const audit: MatureRadioAuditCounts = {
      categoryId: options.categoryId,
      raw: stations.length,
      afterDedupe: deduped.length,
      playableStreams: playableStreams.length,
      httpsStreams,
      afterQuality: filtered.length,
      finalDisplayedCount: filtered.length,
      first20StationNames: filtered.slice(0, 20).map((station) => String(station.name || "").trim()),
    };
    logMatureRadioCategoryAudit(audit);
  }

  return sortStationsByQuality(filtered);
}
