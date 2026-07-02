import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import type { VideoItem } from "../../types/video";

export function normalizeVideoItem(video: HiddenTunesTvVideo): VideoItem {
  const videoId = String(video.source_id || video.id || "").trim();

  return {
    id: videoId,
    title: video.title || "Hidden Tunes Video",
    channelTitle: video.channel_name || "Hidden Tunes",
    videoId,
    thumbnailUrl: video.logo || video.thumbnail_url || undefined,
    source: "youtube",
  };
}

export function videoItemToTvVideo(video: VideoItem): HiddenTunesTvVideo {
  return {
    id: video.videoId,
    title: video.title,
    source_type: "youtube_video",
    source_id: video.videoId,
    logo: video.thumbnailUrl || null,
    thumbnail_url: video.thumbnailUrl || null,
    channel_name: video.channelTitle,
    categories: [],
    tags: [],
  };
}
