import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import type { VideoItem } from "../../types/video";

export function normalizeVideoItem(video: HiddenTunesTvVideo): VideoItem {
  return {
    id: video.source_id,
    title: video.title || "Hidden Tunes Video",
    channelTitle: video.channel_name || "Hidden Tunes",
    videoId: video.source_id,
    thumbnailUrl: video.thumbnail_url || undefined,
    source: "youtube",
  };
}

export function videoItemToTvVideo(video: VideoItem): HiddenTunesTvVideo {
  return {
    id: video.videoId,
    title: video.title,
    source_type: "youtube",
    source_id: video.videoId,
    source_url: `https://www.youtube.com/watch?v=${video.videoId}`,
    embed_url: null,
    thumbnail_url: video.thumbnailUrl || null,
    channel_name: video.channelTitle,
    category: null,
    genre: null,
    mood: null,
    format: null,
    tags: [],
  };
}
