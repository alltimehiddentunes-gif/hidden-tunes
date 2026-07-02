import type { HiddenTunesTvVideo } from "../tvCatalogApi";
import { openHiddenTunesTvStation } from "../../utils/openHiddenTunesTvStation";
import {
  normalizeVideoItem,
  videoItemToTvVideo,
} from "../videos/youtubeNormalizer";
import type { VideoItem } from "../../types/video";

export function isYouTubeVideoSong(song?: { source?: string; type?: string; videoId?: string } | null) {
  return (
    song?.source === "youtube" ||
    song?.type === "youtube_video" ||
    Boolean(song?.videoId)
  );
}

export function routeVideoPlayback(
  video: HiddenTunesTvVideo,
  queueVideos: HiddenTunesTvVideo[],
  deps: { stopPlayback?: () => Promise<void> }
) {
  void deps.stopPlayback?.();
  void openHiddenTunesTvStation(video, queueVideos, deps);
}

export function routeVideoItemPlayback(
  video: VideoItem,
  queue: VideoItem[],
  deps: { stopPlayback?: () => Promise<void> }
) {
  routeVideoPlayback(
    videoItemToTvVideo(video),
    queue.map(videoItemToTvVideo),
    deps
  );
}

export function tvVideoToVideoItem(video: HiddenTunesTvVideo): VideoItem {
  return normalizeVideoItem(video);
}
