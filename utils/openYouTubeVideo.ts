import { router } from "expo-router";
import type { BackendYouTubeTrack } from "../services/youtubeBackend";

export function openYouTubeVideo(track: BackendYouTubeTrack) {
  const videoId =
    track.videoId || String(track.id || "").replace("youtube-", "");

  if (!videoId) return;

  router.push({
    pathname: "/youtube-player",
    params: {
      videoId,
      title: track.title,
      artist: track.artist,
      channelTitle: track.channelTitle,
      thumbnail: track.thumbnail,
    },
  } as any);
}

export function isYouTubeDiscoveryTrack(item: any): item is BackendYouTubeTrack {
  return (
    item?.type === "youtube_video" ||
    item?.source === "youtube" ||
    item?.sourceName === "YouTube" ||
    Boolean(item?.videoId)
  );
}