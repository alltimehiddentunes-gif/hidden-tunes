import { router } from "expo-router";

import {
  buildTvPlayerQueueItem,
  fetchTvPlayback,
  type HiddenTunesTvPlayback,
  type HiddenTunesTvVideo,
} from "../tvCatalogApi";
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

function isYouTubeLikeSource(sourceType: string, streamUrl = "", embedUrl = "") {
  const normalized = sourceType.trim().toLowerCase();
  const normalizedUrl = `${streamUrl} ${embedUrl}`.trim().toLowerCase();

  return (
    normalized === "youtube" ||
    normalized === "youtube_video" ||
    normalizedUrl.includes("youtube.com") ||
    normalizedUrl.includes("youtu.be")
  );
}

function shouldOpenTvPlayer(playback: HiddenTunesTvPlayback) {
  if (!playback.stream_url) return false;

  const normalized = playback.source_type.trim().toLowerCase();
  const normalizedUrl = playback.stream_url.trim().toLowerCase();

  if (normalized === "archive") return false;
  if (isYouTubeLikeSource(playback.source_type, playback.stream_url, playback.embed_url || "")) {
    return false;
  }

  return (
    normalized === "hls_stream" ||
    normalized === "m3u_playlist" ||
    normalized.includes("hls") ||
    normalized.includes("stream") ||
    normalized.endsWith("_stream") ||
    /\.m3u8(?:$|[?#])/.test(normalizedUrl) ||
    Boolean(playback.stream_url)
  );
}

async function resolvePlayback(video: HiddenTunesTvVideo): Promise<HiddenTunesTvPlayback | null> {
  if (isArchiveVideo(video)) {
    const sourceId = String(video.source_id || "").trim();
    if (!sourceId) return null;

    return {
      id: video.id,
      source_type: "archive",
      source_id: sourceId,
      stream_url:
        video.source_url || `https://archive.org/details/${encodeURIComponent(sourceId)}`,
      embed_url:
        video.embed_url || `https://archive.org/embed/${encodeURIComponent(sourceId)}`,
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

export async function openVideoItem(
  videoInput: HiddenTunesTvVideo | VideoItem,
  options: OpenVideoOptions = {}
): Promise<OpenVideoResult> {
  const rawVideo = toHiddenTunesTvVideo(videoInput);
  const playback = await resolvePlayback(rawVideo);

  if (!playback?.stream_url) {
    return {
      ok: false,
      error: "This TV item isn't playable right now. Try another channel.",
    };
  }

  if (shouldOpenTvPlayer(playback)) {
    router.push({
      pathname: "/tv-player",
      params: {
        id: rawVideo.id,
        title: rawVideo.title || "Hidden Tunes TV",
        streamUrl: playback.stream_url,
        sourceType: playback.source_type,
      },
    } as any);

    return { ok: true };
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
