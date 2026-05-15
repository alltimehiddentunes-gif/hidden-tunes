import {
  getHiddenTunesYouTubeCatalog,
  getHiddenTunesYouTubeCatalogPage,
  getRelatedYouTubeVideosPage,
  searchYouTubeBackend,
  searchYouTubeBackendPage,
  BackendYouTubeTrack,
  YouTubePage,
} from "./youtubeBackend";

export interface YouTubeVideo extends BackendYouTubeTrack {
  cover: string;
  publishedAt: string;
}

export type YouTubeVideoPage = {
  videos: YouTubeVideo[];
  nextPageToken?: string;
  error?: string;
};

function normalizeYouTubeVideo(item: BackendYouTubeTrack): YouTubeVideo {
  return {
    ...item,
    cover: item.thumbnail,
    publishedAt: "",
  };
}

function normalizePage(page: YouTubePage): YouTubeVideoPage {
  return {
    videos: page.tracks.map(normalizeYouTubeVideo),
    nextPageToken: page.nextPageToken,
    error: page.error,
  };
}

export async function fetchChannelVideos(): Promise<YouTubeVideo[]> {
  const results = await getHiddenTunesYouTubeCatalog();

  return results.map(normalizeYouTubeVideo);
}

export async function fetchChannelVideosPage(
  pageToken = ""
): Promise<YouTubeVideoPage> {
  const page = await getHiddenTunesYouTubeCatalogPage(pageToken);

  return normalizePage(page);
}

export async function searchYouTubeMusic(
  query: string
): Promise<YouTubeVideo[]> {
  if (!query.trim()) return [];

  const results = await searchYouTubeBackend(query);

  return results.map(normalizeYouTubeVideo);
}

export async function searchYouTubeMusicPage(
  query: string,
  pageToken = ""
): Promise<YouTubeVideoPage> {
  if (!query.trim()) return { videos: [] };

  const page = await searchYouTubeBackendPage(query, pageToken, 50);

  return normalizePage(page);
}

export async function fetchRelatedYouTubeVideosPage(
  videoId: string,
  pageToken = ""
): Promise<YouTubeVideoPage> {
  const page = await getRelatedYouTubeVideosPage(videoId, pageToken);

  return normalizePage(page);
}
