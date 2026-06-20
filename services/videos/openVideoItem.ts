import { router } from "expo-router";

import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import {
  getVideoDisplayCreator,
  isVideoItemPlayableInCurrentRoute,
  normalizeVideoItem,
  type VideoItem,
} from "./videoNormalizer";

type OpenVideoOptions = {
  queueVideos?: HiddenTunesTvVideo[];
  startIndex?: number;
};

function isVideoItem(value: HiddenTunesTvVideo | VideoItem): value is VideoItem {
  return "videoSource" in value;
}

function toVideoItem(video: HiddenTunesTvVideo | VideoItem) {
  return isVideoItem(video) ? video : normalizeVideoItem(video);
}

function buildRouteQueue(videos: HiddenTunesTvVideo[] | undefined) {
  if (!videos?.length) return undefined;

  const queue = videos
    .map((video) => normalizeVideoItem(video))
    .filter(isVideoItemPlayableInCurrentRoute)
    .map((video) => ({
      id: video.externalVideoId,
      videoId: video.externalVideoId,
      externalVideoId: video.externalVideoId,
      videoSource: video.videoSource,
      title: video.title,
      artist: getVideoDisplayCreator(video),
      channelTitle: getVideoDisplayCreator(video),
      thumbnail: video.thumbnailUrl || "",
      embedUrl: video.embedUrl,
      playbackUrl: video.playbackUrl,
    }));

  return queue.length ? queue : undefined;
}

export function openVideoItem(videoInput: HiddenTunesTvVideo | VideoItem, options: OpenVideoOptions = {}) {
  const video = toVideoItem(videoInput);
  const queue = buildRouteQueue(options.queueVideos);
  const routeVideoId = video.videoSource === "youtube" ? video.externalVideoId || "" : "";
  const startIndex =
    typeof options.startIndex === "number"
      ? options.startIndex
      : Math.max(0, queue?.findIndex((item) => item.videoId === routeVideoId) ?? 0);

  router.push({
    pathname: "/youtube-player",
    params: {
      id: video.id,
      videoId: routeVideoId,
      externalVideoId: video.externalVideoId || "",
      videoSource: video.videoSource,
      title: video.title,
      artist: getVideoDisplayCreator(video),
      channelTitle: getVideoDisplayCreator(video),
      thumbnail: video.thumbnailUrl || "",
      category: video.category || "",
      format: video.format || "",
      startIndex: String(startIndex),
      unsupportedVideo: isVideoItemPlayableInCurrentRoute(video) ? "0" : "1",
      queue: queue ? JSON.stringify(queue) : "",
    },
  } as any);
}
