import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PodcastEpisode } from "../types/podcast";

const RECENT_KEY = "hidden_tunes_podcast_recently_played_v1";

export async function loadPodcastRecentlyPlayed(limit = 20): Promise<PodcastEpisode[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? (parsed as PodcastEpisode[]) : [];
    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export async function addPodcastRecentlyPlayed(episode: PodcastEpisode) {
  const current = await loadPodcastRecentlyPlayed(60);
  const next = [episode, ...current.filter((item) => item.id !== episode.id)].slice(0, 60);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export async function clearPodcastRecentlyPlayed() {
  await AsyncStorage.removeItem(RECENT_KEY);
}
