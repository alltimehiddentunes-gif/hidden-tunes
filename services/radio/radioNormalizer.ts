import type { AppSong } from "../../context/PlayerContext";
import type {
  HiddenTunesStation,
  RadioBrowserStationRaw,
  RadioStation,
  RadioStationListItem,
} from "../../types/radio";
import { resolveRadioMatureFields } from "../../utils/matureContentDetection";
import { getRadioCategory } from "../../constants/radioCategories";

const HIDDEN_PROVIDER_TAG =
  /^(radio[- ]?browser|icecast|shoutcast|radionomy|tunein|streema|live365)$/i;

export function sanitizeStationTagsForDisplay(tags: string[]) {
  return tags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)
    .filter((tag) => !HIDDEN_PROVIDER_TAG.test(tag));
}

function normalizeTags(value: unknown) {
  return sanitizeStationTagsForDisplay(
    String(value || "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
  ).slice(0, 8);
}

function pickStreamUrl(station: RadioBrowserStationRaw) {
  const candidate = String(station.url_resolved || station.url || "").trim();
  if (!candidate.startsWith("https://")) return "";
  return candidate;
}

function buildStationId(station: RadioBrowserStationRaw) {
  return String(station.stationuuid || station.name || "")
    .trim()
    .toLowerCase();
}

export function normalizeRadioBrowserStation(
  station: RadioBrowserStationRaw,
  categoryId: string
): HiddenTunesStation | null {
  const id = buildStationId(station);
  const streamUrl = pickStreamUrl(station);
  const name = String(station.name || "").trim();

  if (!id || !name || !streamUrl) return null;

  const category = getRadioCategory(categoryId);
  const mature = resolveRadioMatureFields({
    name,
    tags: normalizeTags(station.tags),
    categoryIsMature: category?.isMature,
  });

  return {
    id,
    name,
    streamUrl,
    favicon: String(station.favicon || "").trim() || undefined,
    country:
      String(station.countrycode || station.country || "")
        .trim()
        .toUpperCase()
        .slice(0, 2) || undefined,
    language: String(station.language || "").trim() || undefined,
    tags: normalizeTags(station.tags),
    bitrate: Number.isFinite(Number(station.bitrate))
      ? Number(station.bitrate)
      : undefined,
    codec: String(station.codec || "").trim() || undefined,
    categoryId,
    cachedAt: Date.now(),
    is_mature: mature.is_mature,
    mature_reason: mature.mature_reason,
    content_rating: mature.content_rating,
  };
}

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

export function radioStationToAppSong(station: RadioStation): AppSong {
  const subtitle = [station.country, station.genre, ...(station.tags || []).slice(0, 2)]
    .filter(Boolean)
    .join(" · ");

  return {
    id: `radio-${station.id}`,
    title: station.title,
    artist: subtitle || "Hidden Tunes Radio",
    streamUrl: station.streamUrl,
    url: station.streamUrl,
    artworkUrl: station.artworkUrl,
    coverUrl: station.artworkUrl,
    thumbnail: station.artworkUrl,
    genre: station.genre,
    source: "radio",
    sourceName: "Hidden Tunes",
    type: "live_stream",
    isOnline: true,
  };
}

export function stationQualityLabel(station: Pick<HiddenTunesStation, "bitrate" | "codec">) {
  const bitrate = Number(station.bitrate);
  const codec = String(station.codec || "").trim().toUpperCase();
  if (Number.isFinite(bitrate) && bitrate > 0 && codec) return `${bitrate}k ${codec}`;
  if (Number.isFinite(bitrate) && bitrate > 0) return `${bitrate}k`;
  if (codec) return codec;
  return "";
}

export function stationRowSubtitle(
  station: Pick<HiddenTunesStation, "country" | "language" | "tags">
) {
  const tags = sanitizeStationTagsForDisplay(station.tags || []).slice(0, 2).join(" · ");
  const parts = [station.country, station.language, tags].filter(Boolean);
  return parts.join(" · ") || "Live station";
}

export function toRadioStationListItem(station: HiddenTunesStation): RadioStationListItem {
  const tags = sanitizeStationTagsForDisplay(station.tags || []);
  const qualityLabel = stationQualityLabel(station);

  return {
    id: station.id,
    title: station.name,
    country: station.country,
    language: station.language,
    genre: tags[0],
    tags,
    artworkUrl: station.favicon,
    subtitle: stationRowSubtitle(station),
    bitrate: station.bitrate,
    codec: station.codec,
    qualityLabel: qualityLabel || undefined,
    qualityScore: station.quality_score,
    is_mature: station.is_mature,
    content_rating: station.content_rating,
  };
}
