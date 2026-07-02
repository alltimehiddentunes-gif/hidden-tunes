import { router } from "expo-router";

import type { HiddenTunesTvPlayback } from "../services/tvCatalogApi";
import {
  buildTvPlayerQueue,
  buildTvPlayerQueueItem,
  fetchTvPlayback,
  type HiddenTunesTvVideo,
} from "../services/tvCatalogApi";
import { HIDDEN_TUNES_VIDEOS_LABEL } from "./launchVideoCategories";

const HIDDEN_PROVIDER_PATTERN = /\byoutube\b|youtu\.be|google\s*play/i;

export type TvStationOpenResult =
  | { ok: true }
  | { ok: false; error: string };

export function sanitizeVideoDiscoveryText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "";

  if (!HIDDEN_PROVIDER_PATTERN.test(text)) return text;

  return text
    .replace(HIDDEN_PROVIDER_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function videoDiscoveryDisplayName(value?: string | null) {
  const cleaned = sanitizeVideoDiscoveryText(value);
  return cleaned || HIDDEN_TUNES_VIDEOS_LABEL;
}

function isHlsLikeSource(sourceType: string) {
  const normalized = sourceType.trim().toLowerCase();
  return (
    normalized === "hls_stream" ||
    normalized === "m3u_playlist" ||
    normalized.endsWith("_stream")
  );
}

function buildHiddenTunesVideoQueue(videos: HiddenTunesTvVideo[]) {
  return buildTvPlayerQueue(videos).map((item) => ({
    ...item,
    title: videoDiscoveryDisplayName(item.title),
    artist: videoDiscoveryDisplayName(
      item.artist === "Hidden Tunes TV" ? null : item.artist
    ),
    channelTitle: videoDiscoveryDisplayName(
      item.channelTitle === "Hidden Tunes TV" ? null : item.channelTitle
    ),
  }));
}

function navigateToYoutubePlayer(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[],
  playback: HiddenTunesTvPlayback
): TvStationOpenResult {
  const queue = buildHiddenTunesVideoQueue(queueVideos);
  const tappedItem = buildTvPlayerQueueItem(video, playback);
  const sourceId = playback.source_id || tappedItem.videoId;
  const foundIndex = queue.findIndex((item) => item.videoId === sourceId);
  const displayTappedItem = {
    ...tappedItem,
    videoId: sourceId,
    id: sourceId,
    title: videoDiscoveryDisplayName(tappedItem.title),
    artist: videoDiscoveryDisplayName(
      tappedItem.artist === "Hidden Tunes TV" ? null : tappedItem.artist
    ),
    channelTitle: videoDiscoveryDisplayName(
      tappedItem.channelTitle === "Hidden Tunes TV" ? null : tappedItem.channelTitle
    ),
  };

  if (foundIndex >= 0) {
    queue[foundIndex] = displayTappedItem;
  } else {
    queue.unshift(displayTappedItem);
  }

  router.push({
    pathname: "/youtube-player",
    params: {
      id: sourceId,
      videoId: sourceId,
      title: videoDiscoveryDisplayName(video.title),
      artist: videoDiscoveryDisplayName(video.channel_name),
      channelTitle: videoDiscoveryDisplayName(video.channel_name),
      thumbnail:
        video.logo ||
        video.thumbnail_url ||
        `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`,
      queue: JSON.stringify(queue),
      startIndex: String(foundIndex >= 0 ? foundIndex : 0),
    },
  } as any);

  return { ok: true };
}

function navigateToHlsPlayer(
  video: HiddenTunesTvVideo,
  playback: HiddenTunesTvPlayback
): TvStationOpenResult {
  router.push({
    pathname: "/tv-player",
    params: {
      channelId: `backend-${video.id}`,
      streamUrl: playback.stream_url,
      title: video.title,
      logo: video.logo || video.thumbnail_url || "",
      sourceType: playback.source_type,
    },
  } as any);

  return { ok: true };
}

function navigateToYoutubePlayerLegacy(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[]
): TvStationOpenResult {
  const sourceId = String(video.source_id || "").trim();
  if (!sourceId) {
    return {
      ok: false,
      error: "This TV station isn't playable right now. Try another channel.",
    };
  }

  const playback: HiddenTunesTvPlayback = {
    id: video.id,
    source_type: video.source_type || "youtube_video",
    source_id: sourceId,
    stream_url: `https://www.youtube.com/watch?v=${sourceId}`,
    embed_url: null,
  };

  return navigateToYoutubePlayer(video, queueVideos, playback);
}

export async function openHiddenTunesTvStation(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[],
  options?: { stopPlayback?: () => Promise<void> }
): Promise<TvStationOpenResult> {
  try {
    await options?.stopPlayback?.();
  } catch {
    // Non-fatal — TV playback owns the surface.
  }

  const playback = await fetchTvPlayback(video);
  if (!playback?.stream_url) {
    if (video.source_id && !isHlsLikeSource(video.source_type || "")) {
      return navigateToYoutubePlayerLegacy(video, queueVideos);
    }

    return {
      ok: false,
      error: "This TV station isn't playable right now. Try another channel.",
    };
  }

  if (isHlsLikeSource(playback.source_type)) {
    return navigateToHlsPlayer(video, playback);
  }

  return navigateToYoutubePlayer(video, queueVideos, playback);
}

/** @deprecated Use openHiddenTunesTvStation — kept for video category screens. */
export async function openHiddenTunesVideo(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[]
): Promise<TvStationOpenResult> {
  return openHiddenTunesTvStation(video, queueVideos);
}

export function videoDiscoverySubtitle(video: HiddenTunesTvVideo) {
  const parts = [
    ...(video.categories || []),
    video.country,
    video.language,
  ]
    .map((part) => sanitizeVideoDiscoveryText(part))
    .filter(Boolean);

  return parts.slice(0, 3).join(" · ") || HIDDEN_TUNES_VIDEOS_LABEL;
}
