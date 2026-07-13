import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import {
  filterBrowsePlayableTvVideos,
  filterBrowsePlayableTvVideosAsync,
  isBrowsePlayableTvVideo,
  isStationEligible,
  type TvStationMetadataMode,
} from "@/utils/tvPlayabilityGate";

export function isPublicTvCatalogVideo(
  video: HiddenTunesTvVideo,
  metadataMode?: TvStationMetadataMode
) {
  return isStationEligible(video, undefined, metadataMode);
}

export function dedupeTvCatalogVideos(videos: HiddenTunesTvVideo[]) {
  const seen = new Set<string>();
  const output: HiddenTunesTvVideo[] = [];

  for (const video of videos) {
    const id = String(video.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(video);
  }

  return output;
}

export { isStationEligible } from "@/utils/tvPlayabilityGate";

export function filterPublicTvCatalogVideos(
  videos: HiddenTunesTvVideo[],
  metadataMode?: TvStationMetadataMode
) {
  return filterBrowsePlayableTvVideos(videos, metadataMode);
}

export function filterEligibleTvStations(
  videos: HiddenTunesTvVideo[],
  metadataMode?: TvStationMetadataMode
) {
  return filterPublicTvCatalogVideos(videos, metadataMode);
}

export async function filterPublicTvCatalogVideosAsync(videos: HiddenTunesTvVideo[]) {
  return filterBrowsePlayableTvVideosAsync(videos);
}
