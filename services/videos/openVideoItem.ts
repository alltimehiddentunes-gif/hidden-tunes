import { Platform } from "react-native";
import { router } from "expo-router";

import {
  buildTvPlayerQueueItem,
  fetchTvPlayback,
  type HiddenTunesTvPlayback,
  type HiddenTunesTvVideo,
} from "../tvCatalogApi";
import { openTvDiscoveryStation } from "../tvDiscoveryOpen";
import type { TvDiscoveryLaunchContext } from "@/types/tvDiscovery";
import {
  getVideoDisplayCreator,
  isVideoItemPlayableInCurrentRoute,
  normalizeVideoItem,
  type VideoItem,
} from "./videoNormalizer";
import {
  clearTvPlaybackFailure,
  getTvPlaybackFailureCount,
  recordTvPlaybackFailure,
} from "../../utils/tvPlaybackFailureStore";
import {
  isBrowsePlayableTvVideo,
  isPlatformBlockedStreamUrl,
  isResolvedStreamPlayable,
  TV_LOCAL_QUARANTINE_THRESHOLD,
} from "../../utils/tvPlayabilityGate";

type OpenVideoOptions = {
  queueVideos?: HiddenTunesTvVideo[];
  startIndex?: number;
  discoveryContext?: TvDiscoveryLaunchContext;
};

export type OpenVideoResult = { ok: true } | { ok: false; error: string };

function isVideoItem(value: HiddenTunesTvVideo | VideoItem): value is VideoItem {
  return "videoSource" in value;
}

function toHiddenTunesTvVideo(video: HiddenTunesTvVideo | VideoItem): HiddenTunesTvVideo {
  if (!isVideoItem(video)) return video;

  return {
    id: video.id,
    title: video.title,
    categories: video.category ? [video.category] : [],
    source_type: video.videoSource,
    source_id: video.externalVideoId,
    source_url: video.playbackUrl,
    embed_url: video.embedUrl,
    thumbnail_url: video.thumbnailUrl,
    channel_name: video.creatorName,
    category: video.category,
    genre: video.genre,
    mood: video.mood,
    format: video.format,
    tags: video.tags,
  };
}

function isArchiveVideo(video: HiddenTunesTvVideo) {
  return video.source_type === "archive" || video.id.startsWith("archive-");
}

function isYouTubeLikeSource(sourceType: string, streamUrl = "") {
  const normalized = sourceType.trim().toLowerCase();
  const normalizedUrl = streamUrl.trim().toLowerCase();

  return (
    normalized === "youtube" ||
    normalized === "youtube_video" ||
    normalizedUrl.includes("youtube.com") ||
    normalizedUrl.includes("youtu.be")
  );
}

function isHttpOnlyStream(url: string) {
  try {
    return new URL(url).protocol === "http:";
  } catch {
    return false;
  }
}

function blockedMobileStreamMessage(streamUrl: string) {
  if (!isPlatformBlockedStreamUrl(streamUrl)) return "";
  if (Platform.OS === "ios" && isHttpOnlyStream(streamUrl)) {
    return "http_stream_blocked_ios";
  }
  if (Platform.OS === "android" && isHttpOnlyStream(streamUrl)) {
    return "http_stream_blocked_android";
  }
  return "stream_blocked";
}

function shouldOpenTvPlayer(playback: HiddenTunesTvPlayback) {
  if (!playback.stream_url) return false;

  const normalized = playback.source_type.trim().toLowerCase();
  const normalizedUrl = playback.stream_url.trim().toLowerCase();
  const isHlsOrStream =
    normalized === "hls_stream" ||
    normalized === "m3u_playlist" ||
    normalized.includes("hls") ||
    normalized.includes("stream") ||
    normalized.endsWith("_stream") ||
    /\.m3u8(?:$|[?#])/.test(normalizedUrl);

  if (normalized === "archive") return false;
  if (isHlsOrStream) return true;
  if (isYouTubeLikeSource(playback.source_type, playback.stream_url)) {
    return false;
  }

  return Boolean(playback.stream_url);
}

async function resolvePlayback(video: HiddenTunesTvVideo): Promise<HiddenTunesTvPlayback | null> {
  if (isArchiveVideo(video)) {
    const sourceId = String(video.source_id || "").trim();
    if (!sourceId) return null;

    return {
      id: video.id,
      source_type: "archive",
      source_id: sourceId,
      stream_url: `https://archive.org/details/${encodeURIComponent(sourceId)}`,
      embed_url: `https://archive.org/embed/${encodeURIComponent(sourceId)}`,
    };
  }

  return fetchTvPlayback(video);
}

function withPlayback(video: HiddenTunesTvVideo, playback: HiddenTunesTvPlayback): HiddenTunesTvVideo {
  return {
    ...video,
    source_type: playback.source_type,
    source_id: playback.source_id,
    source_url: playback.stream_url,
    embed_url: playback.embed_url,
  };
}

function buildRouteQueue(
  queueVideos: HiddenTunesTvVideo[],
  tappedVideoId: string,
  playback: HiddenTunesTvPlayback
) {
  return queueVideos
    .map((video) =>
      buildTvPlayerQueueItem(
        video,
        video.id === tappedVideoId ? playback : null
      )
    )
    .filter((item) => item.videoId);
}

function shouldUseTvDiscoveryPlayer(video: HiddenTunesTvVideo) {
  if (isArchiveVideo(video)) return false;

  const sourceType = String(video.source_type || "").trim().toLowerCase();
  const sourceUrl = String(video.source_url || "").trim().toLowerCase();

  if (isYouTubeLikeSource(sourceType, sourceUrl)) return false;
  if (video.id.startsWith("iptv-org-")) return true;

  if (
    sourceType === "hls_stream" ||
    sourceType === "m3u_playlist" ||
    sourceType.includes("hls") ||
    sourceType.includes("stream") ||
    sourceType === "iptv" ||
    sourceType === "iptv_channel"
  ) {
    return true;
  }

  if (/\.m3u8(?:$|[?#])/.test(sourceUrl)) return true;

  return !sourceType || sourceType === "live_tv";
}

async function openLiveTvDiscovery(
  rawVideo: HiddenTunesTvVideo,
  options: OpenVideoOptions
): Promise<OpenVideoResult> {
  if (!isBrowsePlayableTvVideo(rawVideo)) {
    await markPlaybackFailure(rawVideo.id);
    return { ok: false, error: "station_not_playable" };
  }

  const result = await openTvDiscoveryStation(rawVideo, {
    queueVideos: options.queueVideos,
    startIndex: options.startIndex,
    discoveryContext: options.discoveryContext,
  });

  if (!result.ok) {
    await markPlaybackFailure(rawVideo.id);
    return { ok: false, error: result.error };
  }

  return { ok: true };
}

async function markPlaybackFailure(channelId: string) {
  return recordTvPlaybackFailure(channelId);
}

export async function openVideoItem(
  videoInput: HiddenTunesTvVideo | VideoItem,
  options: OpenVideoOptions = {}
): Promise<OpenVideoResult> {
  const rawVideo = toHiddenTunesTvVideo(videoInput);

  if (shouldUseTvDiscoveryPlayer(rawVideo)) {
    return openLiveTvDiscovery(rawVideo, options);
  }

  let playback: HiddenTunesTvPlayback | null = null;
  try {
    playback = await resolvePlayback(rawVideo);
  } catch {
    await markPlaybackFailure(rawVideo.id);
    return {
      ok: false,
      error: "This TV channel could not be resolved right now. Try another channel.",
    };
  }

  if (!playback?.stream_url || !isResolvedStreamPlayable(playback)) {
    await markPlaybackFailure(rawVideo.id);
    return {
      ok: false,
      error: "stream_unavailable",
    };
  }

  const blockedMessage = blockedMobileStreamMessage(playback.stream_url);
  if (blockedMessage) {
    await markPlaybackFailure(rawVideo.id);
    return {
      ok: false,
      error: blockedMessage,
    };
  }

  if (shouldOpenTvPlayer(playback)) {
    await clearTvPlaybackFailure(rawVideo.id);
    return openLiveTvDiscovery(rawVideo, options);
  }

  const enrichedVideo = withPlayback(rawVideo, playback);
  const item = normalizeVideoItem(enrichedVideo);
  const queueVideos = options.queueVideos?.length ? options.queueVideos : [rawVideo];
  const queue = buildRouteQueue(queueVideos, rawVideo.id, playback);
  const routeVideoId =
    item.videoSource === "youtube"
      ? item.externalVideoId || playback.source_id
      : playback.source_id || item.id;
  const startIndex =
    typeof options.startIndex === "number"
      ? options.startIndex
      : Math.max(0, queue.findIndex((entry) => entry.videoId === routeVideoId));

  await clearTvPlaybackFailure(rawVideo.id);

  router.push({
    pathname: "/youtube-player",
    params: {
      id: rawVideo.id,
      videoId: routeVideoId,
      externalVideoId: item.externalVideoId || playback.source_id,
      videoSource: item.videoSource,
      title: item.title,
      artist: getVideoDisplayCreator(item),
      channelTitle: getVideoDisplayCreator(item),
      thumbnail: item.thumbnailUrl || rawVideo.logo || rawVideo.thumbnail_url || "",
      embedUrl: playback.embed_url || item.embedUrl || "",
      playbackUrl: playback.stream_url || item.playbackUrl || "",
      category: item.category || "",
      format: item.format || "",
      startIndex: String(startIndex >= 0 ? startIndex : 0),
      unsupportedVideo: isVideoItemPlayableInCurrentRoute(item) ? "0" : "1",
      queue: queue.length ? JSON.stringify(queue) : "",
    },
  } as any);

  return { ok: true };
}

export async function openVideoItemWithAlert(
  videoInput: HiddenTunesTvVideo | VideoItem,
  options: OpenVideoOptions & {
    onQuarantined?: (channelId: string) => void;
  } = {}
): Promise<OpenVideoResult> {
  const rawVideo = toHiddenTunesTvVideo(videoInput);
  const result = await openVideoItem(videoInput, options);

  if (!result.ok) {
    const failures = await getTvPlaybackFailureCount(rawVideo.id);
    if (failures >= TV_LOCAL_QUARANTINE_THRESHOLD) {
      options.onQuarantined?.(rawVideo.id);
    }
    return result;
  }

  return result;
}
