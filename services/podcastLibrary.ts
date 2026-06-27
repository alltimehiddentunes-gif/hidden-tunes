import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PodcastEpisode, PodcastShow } from "../types/podcast";

const FOLLOWED_SHOWS_KEY = "hidden_tunes_podcast_follows_v1";
const SAVED_EPISODES_KEY = "hidden_tunes_podcast_saved_episodes_v1";

export async function followPodcastShow(show: PodcastShow) {
  const current = await getFollowedPodcastShows();
  const next = [show, ...current.filter((item) => item.id !== show.id)].slice(0, 200);
  await AsyncStorage.setItem(FOLLOWED_SHOWS_KEY, JSON.stringify(next));
  return next;
}

export async function unfollowPodcastShow(showId: string) {
  const current = await getFollowedPodcastShows();
  const next = current.filter((item) => item.id !== showId);
  await AsyncStorage.setItem(FOLLOWED_SHOWS_KEY, JSON.stringify(next));
  return next;
}

export async function getFollowedPodcastShows(): Promise<PodcastShow[]> {
  try {
    const raw = await AsyncStorage.getItem(FOLLOWED_SHOWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePodcastEpisode(episode: PodcastEpisode) {
  const current = await getSavedPodcastEpisodes();
  const next = [episode, ...current.filter((item) => item.id !== episode.id)].slice(0, 200);
  await AsyncStorage.setItem(SAVED_EPISODES_KEY, JSON.stringify(next));
  return next;
}

export async function unsavePodcastEpisode(episodeId: string) {
  const current = await getSavedPodcastEpisodes();
  const next = current.filter((item) => item.id !== episodeId);
  await AsyncStorage.setItem(SAVED_EPISODES_KEY, JSON.stringify(next));
  return next;
}

export async function getSavedPodcastEpisodes(): Promise<PodcastEpisode[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_EPISODES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
