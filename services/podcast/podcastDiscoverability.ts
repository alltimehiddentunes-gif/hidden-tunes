import type {
  HiddenTunesPodcastEpisode,
  HiddenTunesPodcastShow,
} from "../podcastCatalogApi";
import { HIDDEN_TUNES_PODCASTS_LABEL } from "../../constants/podcastCategories";
import { isValidPodcastShowId } from "../../utils/podcastShowId";

const DEAD_SHOW_PATTERN =
  /\b(test feed|placeholder|lorem ipsum|sample podcast|demo feed|untitled podcast|podcast show)\b/i;

export function isPlayablePodcastAudioUrl(url?: string | null) {
  return String(url || "").trim().startsWith("https://");
}

export function isPlayablePodcastEpisode(episode: HiddenTunesPodcastEpisode) {
  return isPlayablePodcastAudioUrl(episode.audio_url);
}

export function filterPlayablePodcastEpisodes(episodes: HiddenTunesPodcastEpisode[]) {
  return episodes.filter(isPlayablePodcastEpisode);
}

export function isDiscoverablePodcastShow(show: HiddenTunesPodcastShow) {
  if (!isValidPodcastShowId(show.id)) return false;

  const title = String(show.title || "").trim();
  if (!title || title.length < 2) return false;
  if (title === HIDDEN_TUNES_PODCASTS_LABEL) return false;
  if (DEAD_SHOW_PATTERN.test(title)) return false;

  const combined = `${title} ${show.description || ""} ${show.host_name || ""}`;
  if (DEAD_SHOW_PATTERN.test(combined)) return false;

  const episodes = Math.max(0, Number(show.episode_count) || 0);
  const hasPublishedSignal = Boolean(String(show.last_published_at || "").trim());

  return episodes > 0 || hasPublishedSignal;
}

export function playabilitySignalScore(show: HiddenTunesPodcastShow) {
  let score = show.quality_score || 0;
  const episodes = Math.max(0, Number(show.episode_count) || 0);

  if (episodes > 0) score += 20;
  if (episodes >= 5) score += 8;
  if (show.last_published_at) score += 10;
  if (show.artwork_url) score += 4;
  if (show.host_name) score += 2;

  return score;
}

export function rankShowsByPlayabilitySignal(shows: HiddenTunesPodcastShow[]) {
  return [...shows].sort(
    (left, right) => playabilitySignalScore(right) - playabilitySignalScore(left)
  );
}

export function filterDiscoverablePodcastShows(shows: HiddenTunesPodcastShow[]) {
  return rankShowsByPlayabilitySignal(shows.filter(isDiscoverablePodcastShow));
}
