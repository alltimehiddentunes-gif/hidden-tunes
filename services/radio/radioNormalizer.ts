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

function normalizeCatalogTags(value: unknown) {
  if (Array.isArray(value)) {
    return sanitizeStationTagsForDisplay(
      value.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
    ).slice(0, 8);
  }

  return normalizeTags(value);
}

/** Metadata-only station row from Hidden Tunes radio catalog (no stream URL in browse). */
export function normalizeRadioCatalogStation(
  raw: Record<string, unknown>,
  categoryId: string
): HiddenTunesStation | null {
  const id = String(raw.id || raw.slug || "").trim();
  const name = String(raw.name || raw.title || "").trim();
  if (!id || !name) return null;

  const category = getRadioCategory(categoryId);
  const tags = normalizeCatalogTags(raw.tags ?? raw.genres);
  const mature = resolveRadioMatureFields({
    name,
    tags,
    categoryIsMature:
      category?.isMature ||
      raw.is_mature === true ||
      raw.isMature === true,
  });

  const qualityScore = Number(raw.quality_score ?? raw.qualityScore);
  const votes = Number(raw.votes);
  const clicks = Number(raw.clickcount ?? raw.click_count ?? raw.clicks);

  return {
    id,
    name,
    streamUrl: "",
    favicon:
      String(raw.logo_url || raw.logoUrl || raw.favicon || raw.artwork_url || "")
        .trim() || undefined,
    country:
      String(raw.country_code || raw.countryCode || raw.country || "")
        .trim()
        .toUpperCase()
        .slice(0, 2) || undefined,
    language: String(raw.language || "").trim() || undefined,
    tags,
    bitrate: Number.isFinite(Number(raw.bitrate)) ? Number(raw.bitrate) : undefined,
    codec: String(raw.codec || "").trim() || undefined,
    votes: Number.isFinite(votes) ? votes : undefined,
    clickcount: Number.isFinite(clicks) ? clicks : undefined,
    quality_score: Number.isFinite(qualityScore) ? qualityScore : undefined,
    categoryId,
    cachedAt: Date.now(),
    is_mature:
      raw.is_mature === true ||
      raw.isMature === true ||
      mature.is_mature,
    mature_reason:
      String(raw.mature_reason || raw.matureReason || "").trim() ||
      mature.mature_reason,
    content_rating:
      (raw.content_rating as HiddenTunesStation["content_rating"]) ||
      (raw.contentRating as HiddenTunesStation["content_rating"]) ||
      mature.content_rating,
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
