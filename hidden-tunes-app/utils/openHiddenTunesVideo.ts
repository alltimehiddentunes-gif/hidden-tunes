import { router } from "expo-router";

import {
  buildTvPlayerQueue,
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

export function openHiddenTunesVideo(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[]
) {
  const queue = buildHiddenTunesVideoQueue(queueVideos);
  const startIndex = Math.max(
    0,
    queue.findIndex((item) => item.videoId === video.source_id)
  );

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
      startIndex: String(startIndex >= 0 ? startIndex : 0),
    },
  } as any);
}

export function videoDiscoverySubtitle(video: HiddenTunesTvVideo) {
  const parts = [video.genre, video.format, video.mood]
    .map((part) => sanitizeVideoDiscoveryText(part))
    .filter(Boolean);

  return parts.join(" · ") || HIDDEN_TUNES_VIDEOS_LABEL;
}
