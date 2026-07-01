import { router } from "expo-router";

import {
  buildTvPlayerQueue,
  buildTvPlayerQueueItem,
  fetchTvPlayback,
  type HiddenTunesTvVideo,
} from "../services/tvCatalogApi";
import { HIDDEN_TUNES_VIDEOS_LABEL } from "./launchVideoCategories";

const HIDDEN_PROVIDER_PATTERN = /\byoutube\b|youtu\.be|google\s*play/i;

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

export async function openHiddenTunesVideo(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[]
) {
  const playback = await fetchTvPlayback(video);
  if (!playback) return;

  const queue = buildHiddenTunesVideoQueue(queueVideos);
  const tappedItem = buildTvPlayerQueueItem(video, playback);
  const foundIndex = queue.findIndex((item) => item.videoId === video.source_id);
  const displayTappedItem = {
    ...tappedItem,
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
      id: video.source_id,
      videoId: video.source_id,
      title: videoDiscoveryDisplayName(video.title),
      artist: videoDiscoveryDisplayName(video.channel_name),
      channelTitle: videoDiscoveryDisplayName(video.channel_name),
      thumbnail:
        video.thumbnail_url ||
        `https://i.ytimg.com/vi/${video.source_id}/hqdefault.jpg`,
      queue: JSON.stringify(queue),
      startIndex: String(foundIndex >= 0 ? foundIndex : 0),
    },
  } as any);
}

export function videoDiscoverySubtitle(video: HiddenTunesTvVideo) {
  const parts = [video.genre, video.format, video.mood]
    .map((part) => sanitizeVideoDiscoveryText(part))
    .filter(Boolean);

  return parts.join(" · ") || HIDDEN_TUNES_VIDEOS_LABEL;
}
