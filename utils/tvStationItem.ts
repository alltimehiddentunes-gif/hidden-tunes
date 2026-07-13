import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import { TV_PUBLIC_RELIABILITY_THRESHOLD } from "@/utils/tvArtwork";
import {
  getTvStationMetadataMode,
  isBrowsePlayableTvVideo,
  TV_VERIFIED_RELIABILITY_THRESHOLD,
  type TvStationMetadataMode,
} from "@/utils/tvPlayabilityGate";
import { resolveTvArtworkUrl } from "@/utils/tvArtwork";
import type { TvQueueItem } from "@/types/tvDiscovery";

function clean(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

const REGION_CATEGORY_NAMES = new Set([
  "Africa",
  "Europe",
  "Americas",
  "Asia",
  "Local TV",
]);

export function inferTvRegion(video: HiddenTunesTvVideo) {
  for (const category of video.categories || []) {
    if (REGION_CATEGORY_NAMES.has(category)) return category;
  }

  const country = clean(video.country).toLowerCase();
  if (
    country.includes("ghana") ||
    country.includes("nigeria") ||
    country.includes("kenya") ||
    country.includes("south africa")
  ) {
    return "Africa";
  }
  if (
    country.includes("germany") ||
    country.includes("france") ||
    country.includes("uk") ||
    country.includes("united kingdom") ||
    country.includes("spain") ||
    country.includes("italy")
  ) {
    return "Europe";
  }
  if (
    country.includes("usa") ||
    country.includes("united states") ||
    country.includes("canada") ||
    country.includes("brazil") ||
    country.includes("mexico")
  ) {
    return "Americas";
  }

  return clean(video.country) || "";
}

export function tvVideoToQueueItem(
  video: HiddenTunesTvVideo,
  options?: { hierarchyLevel?: number; hierarchyLabel?: string; metadataMode?: TvStationMetadataMode }
): TvQueueItem {
  const metadataMode = options?.metadataMode || video.metadataMode || getTvStationMetadataMode(video);
  const category =
    clean(video.category) ||
    clean(video.categories?.[0]) ||
    clean(video.genre) ||
    "";
  const subcategory = clean(video.categories?.[1]) || "";
  const score = Number(video.reliability_score ?? 100);
  const verified =
    video.verified === true ||
    (Number.isFinite(score) && score >= TV_VERIFIED_RELIABILITY_THRESHOLD);
  const browsePlayable = isBrowsePlayableTvVideo(video, metadataMode);
  const artwork = resolveTvArtworkUrl(video);

  return {
    stationId: clean(video.id, 200),
    stationName: clean(video.title, 300) || "TV Station",
    artwork,
    country: clean(video.country, 120),
    countryCode: "",
    region: inferTvRegion(video),
    language: clean(video.language, 80),
    category,
    subcategory,
    genre: clean(video.genre, 120),
    broadcaster: clean(video.channel_name, 200),
    verified,
    playable: browsePlayable,
    public: browsePlayable,
    sourceType: clean(video.source_type, 80),
    description: clean(video.description, 2000),
    tags: Array.isArray(video.tags) ? video.tags.map((tag) => clean(tag, 80)).filter(Boolean) : [],
    reliabilityScore: Number.isFinite(score) ? score : TV_PUBLIC_RELIABILITY_THRESHOLD,
    metadataMode,
    hierarchyLevel: options?.hierarchyLevel ?? 0,
    hierarchyLabel: options?.hierarchyLabel || "Current context",
  };
}

export function tvVideosToQueueItems(
  videos: HiddenTunesTvVideo[],
  options?: { hierarchyLevel?: number; hierarchyLabel?: string; metadataMode?: TvStationMetadataMode }
) {
  const metadataMode = options?.metadataMode;
  return videos
    .filter((video) => isBrowsePlayableTvVideo(video, metadataMode || video.metadataMode))
    .map((video) => tvVideoToQueueItem(video, options));
}

export function queueItemToHiddenTunesTvVideo(item: TvQueueItem): HiddenTunesTvVideo {
  return {
    id: item.stationId,
    title: item.stationName,
    description: item.description,
    logo: item.artwork,
    thumbnail_url: item.artwork,
    country: item.country,
    language: item.language,
    categories: [item.category, item.subcategory].filter(Boolean),
    category: item.category,
    genre: item.genre,
    channel_name: item.broadcaster,
    source_type: item.sourceType,
    reliability_score: item.reliabilityScore,
    metadataMode: item.metadataMode,
    tags: item.tags,
  };
}

export function dedupeTvQueueItems(items: TvQueueItem[], seen: Record<string, true> = {}) {
  const output: TvQueueItem[] = [];

  for (const item of items) {
    const id = clean(item.stationId, 200);
    if (!id || seen[id]) continue;
    seen[id] = true;
    output.push(item);
  }

  return output;
}
