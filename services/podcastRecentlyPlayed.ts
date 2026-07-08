import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PodcastEpisode } from "../types/podcast";
import { isPlayablePodcastAudioUrl } from "../utils/podcastPlaybackAdapter";

const RECENT_KEY = "hidden_tunes_podcast_recently_played_v2";
const LEGACY_RECENT_KEY = "hidden_tunes_podcast_recently_played_v1";

const BACKEND_EPISODE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readEpisodeField(episode: PodcastEpisode, key: keyof PodcastEpisode) {
  const value = episode[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Recently played must come from a real backend catalog play resolve, not RSS/demo seeds. */
export function isValidRecentlyPlayedPodcastEpisode(
  episode: unknown
): episode is PodcastEpisode {
  if (!episode || typeof episode !== "object") return false;

  const row = episode as PodcastEpisode;
  const id = readEpisodeField(row, "id");
  const title = readEpisodeField(row, "title");
  const showId = readEpisodeField(row, "showId");
  const showTitle = readEpisodeField(row, "showTitle");
  const audioUrl = readEpisodeField(row, "audioUrl");

  if (!BACKEND_EPISODE_ID_RE.test(id)) return false;
  if (!title || title.length < 2) return false;
  if (!showId || !BACKEND_EPISODE_ID_RE.test(showId)) return false;
  if (!showTitle || showTitle.length < 2) return false;
  if (!audioUrl || !isPlayablePodcastAudioUrl(audioUrl)) return false;

  return true;
}

function filterValidRecentlyPlayed(episodes: PodcastEpisode[]) {
  return episodes.filter(isValidRecentlyPlayedPodcastEpisode);
}

async function readStoredEpisodes(key: string) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [] as PodcastEpisode[];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PodcastEpisode[]) : [];
  } catch {
    return [] as PodcastEpisode[];
  }
}

async function persistRecentlyPlayed(episodes: PodcastEpisode[]) {
  const valid = filterValidRecentlyPlayed(episodes);
  if (valid.length > 0) {
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(valid));
  } else {
    await AsyncStorage.removeItem(RECENT_KEY);
  }
  return valid;
}

async function migrateLegacyRecentlyPlayed() {
  const legacy = await readStoredEpisodes(LEGACY_RECENT_KEY);
  if (!legacy.length) return [] as PodcastEpisode[];

  const valid = filterValidRecentlyPlayed(legacy);
  await AsyncStorage.removeItem(LEGACY_RECENT_KEY);
  if (valid.length > 0) {
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(valid));
  }
  return valid;
}

export async function loadPodcastRecentlyPlayed(limit = 20): Promise<PodcastEpisode[]> {
  try {
    const raw = await readStoredEpisodes(RECENT_KEY);
    let items = filterValidRecentlyPlayed(raw);

    if (!items.length) {
      items = await migrateLegacyRecentlyPlayed();
    } else if (raw.length !== items.length) {
      await persistRecentlyPlayed(items);
    }

    return items.slice(0, limit);
  } catch {
    return [];
  }
}

export async function addPodcastRecentlyPlayed(episode: PodcastEpisode) {
  if (!isValidRecentlyPlayedPodcastEpisode(episode)) {
    return loadPodcastRecentlyPlayed(60);
  }

  const current = await loadPodcastRecentlyPlayed(60);
  const next = [episode, ...current.filter((item) => item.id !== episode.id)].slice(0, 60);
  await persistRecentlyPlayed(next);
  return next;
}

export async function clearPodcastRecentlyPlayed() {
  await AsyncStorage.multiRemove([RECENT_KEY, LEGACY_RECENT_KEY]);
}
