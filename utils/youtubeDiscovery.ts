import { router } from "expo-router";
import type { BackendYouTubeTrack } from "../services/youtubeBackend";

export function getYouTubeVideoId(track: Partial<BackendYouTubeTrack> | any) {
  return String(track?.videoId || track?.id || "")
    .replace("youtube-", "")
    .trim();
}

export function isYouTubeDiscoveryTrack(
  item: any
): item is BackendYouTubeTrack {
  return (
    item?.type === "youtube_video" ||
    item?.source === "youtube" ||
    item?.sourceName === "YouTube" ||
    Boolean(item?.videoId)
  );
}

export function openYouTubeDiscoveryTrack(track: BackendYouTubeTrack) {
  const videoId = getYouTubeVideoId(track);

  if (!videoId) {
    console.log("Missing YouTube videoId:", track);
    return;
  }

  router.push({
    pathname: "/youtube-player",
    params: {
      id: videoId,
      videoId,
      title: track.title || "YouTube Music",
      artist: track.artist || track.channelTitle || "YouTube",
      channelTitle: track.channelTitle || track.artist || "YouTube",
      thumbnail: track.thumbnail || track.artwork || track.cover || "",
    },
  } as any);
}