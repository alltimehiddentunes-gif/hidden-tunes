import { router } from "expo-router";

import type { HiddenTunesTvVideo } from "@/services/tvCatalogApi";
import {
  createTvDiscoverySession,
  getTvDiscoverySession,
} from "@/services/tvDiscoverySessionStore";
import { cancelTvDiscoveryResolution } from "@/services/tvDiscoveryAbort";
import { openTvPlayerFullScreen } from "@/services/tv/tvPlayerNavigation";
import {
  getTvSessionController,
  stopTvSession,
} from "@/services/tv/tvSessionController";
import type { TvDiscoveryLaunchContext, TvStationPlayResult } from "@/types/tvDiscovery";
import { buildDiscoveryHierarchyLayers } from "@/utils/tvDiscoveryHierarchy";
import {
  exploreForwardUntilPlayable,
  playTvDiscoveryStationAtIndex,
} from "@/utils/tvDiscoveryNavigation";
import { TV_NAV_STALE } from "@/utils/tvPlayabilityGate";
import { tvVideoToQueueItem, tvVideosToQueueItems } from "@/utils/tvStationItem";

let tvDiscoveryOpenInFlight: {
  stationId: string;
  generation: number;
  promise: Promise<TvStationPlayResult>;
} | null = null;

/** Latest accepted browse/open tap generation — stale opens must not attach. */
let tvDiscoveryOpenGeneration = 0;

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

function buildTvPlayerRouteParams(
  result: Extract<TvStationPlayResult, { ok: true }>,
  launch?: Pick<TvDiscoveryLaunchContext, "contextTitle" | "browseReturnPath">
) {
  const session = getTvDiscoverySession();

  return {
    id: result.station.stationId,
    channelId: result.station.stationId,
    title: result.station.stationName,
    streamUrl: result.streamUrl,
    sourceType: result.sourceType,
    logo: result.station.artwork || "",
    contextTitle: launch?.contextTitle || session?.contextTitle || "",
    hierarchyLabel: result.station.hierarchyLabel,
    country: result.station.country,
    category: result.station.category,
    artwork: result.station.artwork,
    resolutionSequence: String(result.resolutionSequence),
    browseReturnPath:
      launch?.browseReturnPath ||
      session?.originalContext.browseReturnPath ||
      "/youtube-feed",
  };
}

async function attachResolvedTvSession(
  result: Extract<TvStationPlayResult, { ok: true }>,
  queueVideos: HiddenTunesTvVideo[]
) {
  const controller = getTvSessionController();
  if (!controller) {
    return;
  }

  const itemId = String(result.station.stationId || "").trim();
  const queue =
    queueVideos.length > 0
      ? queueVideos
      : [
          {
            id: itemId,
            title: result.station.stationName,
            logo: result.station.artwork || null,
            thumbnail_url: result.station.artwork || null,
            categories: result.station.category ? [result.station.category] : [],
            country: result.station.country || null,
            language: result.station.language || null,
            source_type: result.sourceType,
          } satisfies HiddenTunesTvVideo,
        ];

  const item =
    queue.find((entry) => entry.id === itemId) ||
    ({
      id: itemId,
      title: result.station.stationName,
      logo: result.station.artwork || null,
      thumbnail_url: result.station.artwork || null,
      categories: result.station.category ? [result.station.category] : [],
      country: result.station.country || null,
      language: result.station.language || null,
      source_type: result.sourceType,
    } satisfies HiddenTunesTvVideo);

  await controller.startResolvedSession({
    item,
    playback: {
      id: itemId,
      source_type: result.sourceType || "hls_stream",
      source_id: String(item.source_id || ""),
      stream_url: result.streamUrl,
      embed_url: null,
    },
    queue,
    presentation: "fullPlayer",
  });
}

async function openTvDiscoveryStationInternal(
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

  const openGeneration = tvDiscoveryOpenGeneration;

  let result = await playTvDiscoveryStationAtIndex(
    getTvDiscoverySession()?.currentIndex ?? 0
  );

  if (openGeneration !== tvDiscoveryOpenGeneration) {
    return { ok: false, error: TV_NAV_STALE, attempts: 0 };
  }

  if (!result.ok && result.error !== TV_NAV_STALE && !result.exhausted) {
    result = await exploreForwardUntilPlayable();
  }

  if (openGeneration !== tvDiscoveryOpenGeneration) {
    return { ok: false, error: TV_NAV_STALE, attempts: 0 };
  }

  if (!result.ok) {
    return result;
  }

  // Attach the already-resolved play contract to the single TV session owner
  // before navigating. Browse still never preloads stream URLs.
  await attachResolvedTvSession(result, queueVideos);

  if (openGeneration !== tvDiscoveryOpenGeneration) {
    return { ok: false, error: TV_NAV_STALE, attempts: 0 };
  }

  openTvPlayerFullScreen("user-open");

  return result;
}

export async function openTvDiscoveryStation(
  video: HiddenTunesTvVideo,
  options: OpenTvDiscoveryOptions = {}
): Promise<TvStationPlayResult> {
  const queueVideos = options.queueVideos?.length ? options.queueVideos : [video];
  const startIndex =
    typeof options.startIndex === "number"
      ? options.startIndex
      : Math.max(
          0,
          queueVideos.findIndex((entry) => entry.id === video.id)
        );
  const anchorId = (queueVideos[startIndex >= 0 ? startIndex : 0] || video).id;

  // Same station already resolving — reuse (suppress duplicate same-card taps).
  if (tvDiscoveryOpenInFlight?.stationId === anchorId) {
    return tvDiscoveryOpenInFlight.promise;
  }

  // Different station (or idle): latest tap wins — abort prior resolution.
  tvDiscoveryOpenGeneration += 1;
  const generation = tvDiscoveryOpenGeneration;
  cancelTvDiscoveryResolution();

  const controller = getTvSessionController();
  const activeId = controller?.getActiveItemId?.() ?? null;
  if (controller?.isSessionActive?.() && activeId !== anchorId) {
    stopTvSession();
  }

  const promise = openTvDiscoveryStationInternal(video, options);
  tvDiscoveryOpenInFlight = { stationId: anchorId, generation, promise };

  try {
    const result = await promise;
    if (generation !== tvDiscoveryOpenGeneration) {
      return { ok: false, error: TV_NAV_STALE, attempts: 0 };
    }
    return result;
  } finally {
    if (tvDiscoveryOpenInFlight?.promise === promise) {
      tvDiscoveryOpenInFlight = null;
    }
  }
}

export function replaceTvPlayerRoute(result: Extract<TvStationPlayResult, { ok: true }>) {
  try {
    void attachResolvedTvSession(result, []);
    router.setParams(buildTvPlayerRouteParams(result) as any);
  } catch {
    // Route params are optional metadata when the player is not focused.
  }
}
