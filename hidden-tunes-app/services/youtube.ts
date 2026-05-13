import {
  searchYouTubeBackend,
  BackendYouTubeTrack,
} from "./youtubeBackend";

export interface YouTubeVideo extends BackendYouTubeTrack {
  cover: string;
  publishedAt: string;
}

function normalizeYouTubeVideo(item: BackendYouTubeTrack): YouTubeVideo {
  return {
    ...item,
    cover: item.thumbnail,
    publishedAt: "",
  };
}

export async function fetchChannelVideos(): Promise<YouTubeVideo[]> {
  const results = await searchYouTubeBackend("Hidden Tunes music");

  return results.map(normalizeYouTubeVideo);
}

export async function searchYouTubeMusic(
  query: string
): Promise<YouTubeVideo[]> {
  if (!query.trim()) return [];

  const results = await searchYouTubeBackend(`${query} music`);

  return results.map(normalizeYouTubeVideo);
}