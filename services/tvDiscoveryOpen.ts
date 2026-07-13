import { router } from "expo-router";

import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import {
  createTvDiscoverySession,
  getTvDiscoverySession,
} from "@/services/tvDiscoverySessionStore";
import type { TvDiscoveryLaunchContext, TvStationPlayResult } from "@/types/tvDiscovery";
import { buildDiscoveryHierarchyLayers } from "@/utils/tvDiscoveryHierarchy";
import {
  exploreForwardUntilPlayable,
  playTvDiscoveryStationAtIndex,
} from "@/utils/tvDiscoveryNavigation";
import { TV_NAV_STALE } from "@/utils/tvPlayabilityGate";
import { tvVideoToQueueItem, tvVideosToQueueItems } from "@/utils/tvStationItem";

export type OpenTvDiscoveryOptions = {
  queueVideos?: HiddenTunesTvVideo[];
  startIndex?: number;
  discoveryContext?: TvDiscoveryLaunchContext;
};

function defaultLaunchContext(video: HiddenTunesTvVideo): TvDiscoveryLaunchContext {
  const category = String(video.category || video.categories?.[0] || "TV").trim();
  return {
    contextType: "tv-discovery",
    contextId: "tv-global",
    contextTitle: "TV Discovery",
    originalCategory: category,
    originalCountry: String(video.country || "").trim(),
    originalLanguage: String(video.language || "").trim(),
    browseReturnPath: "/youtube-feed",
    metadataMode: video.metadataMode,
  };
}

export async function openTvDiscoveryStation(
  video: HiddenTunesTvVideo,
  options: OpenTvDiscoveryOptions = {}
): Promise<TvStationPlayResult> {
  const launch = options.discoveryContext || defaultLaunchContext(video);
  const queueVideos = options.queueVideos?.length ? options.queueVideos : [video];
  const startIndex =
    typeof options.startIndex === "number"
      ? options.startIndex
      : Math.max(
          0,
          queueVideos.findIndex((entry) => entry.id === video.id)
        );

  const initialItems = tvVideosToQueueItems(queueVideos, {
    hierarchyLevel: 0,
    hierarchyLabel: launch.contextTitle,
    metadataMode: launch.metadataMode,
  });

  const anchorVideo = queueVideos[startIndex >= 0 ? startIndex : 0] || video;
  const anchor = tvVideoToQueueItem(anchorVideo, {
    hierarchyLevel: 0,
    hierarchyLabel: launch.contextTitle,
    metadataMode: launch.metadataMode,
  });

  const hierarchyLayers = buildDiscoveryHierarchyLayers(launch, anchor);

  createTvDiscoverySession({
    launch,
    items: initialItems.length ? initialItems : [anchor],
    startIndex: startIndex >= 0 ? startIndex : 0,
    hierarchyLayers,
  });

  let result = await playTvDiscoveryStationAtIndex(
    getTvDiscoverySession()?.currentIndex ?? 0
  );

  if (!result.ok && result.error !== TV_NAV_STALE && !result.exhausted) {
    result = await exploreForwardUntilPlayable();
  }

  if (!result.ok) {
    return result;
  }

  router.push({
    pathname: "/tv-player",
    params: {
      id: result.station.stationId,
      title: result.station.stationName,
      streamUrl: result.streamUrl,
      sourceType: result.sourceType,
      contextTitle: launch.contextTitle,
      hierarchyLabel: result.station.hierarchyLabel,
      country: result.station.country,
      category: result.station.category,
      artwork: result.station.artwork,
      resolutionSequence: String(result.resolutionSequence),
      browseReturnPath: launch.browseReturnPath || "/youtube-feed",
    },
  } as any);

  return result;
}

export function replaceTvPlayerRoute(result: Extract<TvStationPlayResult, { ok: true }>) {
  router.replace({
    pathname: "/tv-player",
    params: {
      id: result.station.stationId,
      title: result.station.stationName,
      streamUrl: result.streamUrl,
      sourceType: result.sourceType,
      contextTitle: getTvDiscoverySession()?.contextTitle || "",
      hierarchyLabel: result.station.hierarchyLabel,
      country: result.station.country,
      category: result.station.category,
      artwork: result.station.artwork,
      resolutionSequence: String(result.resolutionSequence),
      browseReturnPath: getTvDiscoverySession()?.originalContext.browseReturnPath || "/youtube-feed",
    },
  } as any);
}
