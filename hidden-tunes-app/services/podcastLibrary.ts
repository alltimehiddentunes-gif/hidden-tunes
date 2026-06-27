import AsyncStorage from "@react-native-async-storage/async-storage";

import type { HiddenTunesPodcastShow } from "./podcastCatalogApi";

const FOLLOWED_SHOWS_KEY = "hidden_tunes_followed_podcasts_v1";

export type FollowedPodcastShow = {
  id: string;
  title: string;
  artworkUrl?: string;
  hostName?: string;
  primaryCategory?: string;
  followedAt: number;
};

let followedMemoryCache: FollowedPodcastShow[] | null = null;
let followedLoadPromise: Promise<FollowedPodcastShow[]> | null = null;

function normalizeFollowedShow(show: HiddenTunesPodcastShow): FollowedPodcastShow {
  return {
    id: show.id,
    title: show.title,
    artworkUrl: show.artwork_url,
    hostName: show.host_name,
    primaryCategory: show.primary_category,
    followedAt: Date.now(),
  };
}

export async function loadFollowedPodcastShows(): Promise<FollowedPodcastShow[]> {
  if (followedMemoryCache) return followedMemoryCache;
  if (followedLoadPromise) return followedLoadPromise;

  followedLoadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(FOLLOWED_SHOWS_KEY);
      if (!raw) {
        followedMemoryCache = [];
        return [];
      }

      const parsed = JSON.parse(raw);
      followedMemoryCache = Array.isArray(parsed) ? parsed : [];
      return followedMemoryCache;
    } catch {
      followedMemoryCache = [];
      return [];
    } finally {
      followedLoadPromise = null;
    }
  })();

  return followedLoadPromise;
}

async function persistFollowedShows(shows: FollowedPodcastShow[]) {
  followedMemoryCache = shows;
  await AsyncStorage.setItem(FOLLOWED_SHOWS_KEY, JSON.stringify(shows));
}

export async function isPodcastShowFollowed(showId: string) {
  const safeId = String(showId || "").trim();
  if (!safeId) return false;

  const followed = await loadFollowedPodcastShows();
  return followed.some((show) => show.id === safeId);
}

export async function followPodcastShow(show: HiddenTunesPodcastShow) {
  const safeId = String(show.id || "").trim();
  if (!safeId) return loadFollowedPodcastShows();

  const followed = await loadFollowedPodcastShows();
  if (followed.some((entry) => entry.id === safeId)) {
    return followed;
  }

  const next = [normalizeFollowedShow(show), ...followed];
  await persistFollowedShows(next);
  return next;
}

export async function unfollowPodcastShow(showId: string) {
  const safeId = String(showId || "").trim();
  if (!safeId) return loadFollowedPodcastShows();

  const followed = await loadFollowedPodcastShows();
  const next = followed.filter((entry) => entry.id !== safeId);
  await persistFollowedShows(next);
  return next;
}

export async function togglePodcastShowFollow(show: HiddenTunesPodcastShow) {
  const safeId = String(show.id || "").trim();
  if (!safeId) return { followed: false, shows: await loadFollowedPodcastShows() };

  const followed = await isPodcastShowFollowed(safeId);
  const shows = followed
    ? await unfollowPodcastShow(safeId)
    : await followPodcastShow(show);

  return { followed: !followed, shows };
}
