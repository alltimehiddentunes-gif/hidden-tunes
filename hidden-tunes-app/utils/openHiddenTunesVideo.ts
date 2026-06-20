import { router } from "expo-router";

import {
  buildTvPlayerQueue,
  type HiddenTunesTvVideo,
} from "../services/tvCatalogApi";
import { HIDDEN_TUNES_VIDEOS_LABEL } from "./launchVideoCategories";

export function openHiddenTunesVideo(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[]
) {
  const queue = buildTvPlayerQueue(queueVideos);
  const startIndex = Math.max(
    0,
    queue.findIndex((item) => item.videoId === video.source_id)
  );

  router.push({
    pathname: "/youtube-player",
    params: {
      id: video.source_id,
      videoId: video.source_id,
      title: video.title,
      artist: video.channel_name || HIDDEN_TUNES_VIDEOS_LABEL,
      channelTitle: video.channel_name || HIDDEN_TUNES_VIDEOS_LABEL,
      thumbnail:
        video.thumbnail_url ||
        `https://i.ytimg.com/vi/${video.source_id}/hqdefault.jpg`,
      queue: JSON.stringify(queue),
      startIndex: String(startIndex >= 0 ? startIndex : 0),
    },
  } as any);
}

export function videoDiscoverySubtitle(video: HiddenTunesTvVideo) {
  const parts = [video.genre, video.format, video.mood].filter(Boolean);
  return parts.join(" · ") || HIDDEN_TUNES_VIDEOS_LABEL;
}
