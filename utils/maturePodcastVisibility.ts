import type {
  HiddenTunesPodcastEpisode,
  HiddenTunesPodcastShow,
} from "../services/podcastCatalogApi";
import { isMatureContentItem, type MatureContentFields } from "../types/matureContent";
import { shouldIncludeMatureInApi } from "./matureContentSettings";

export function filterVisiblePodcastShows(shows: HiddenTunesPodcastShow[]) {
  if (shouldIncludeMatureInApi()) return shows;
  return shows.filter((show) => !isMatureContentItem(show));
}

export function isMaturePodcastEpisode(
  episode: MatureContentFields | null | undefined,
  showIsMature = false
) {
  return isMatureContentItem(episode) || showIsMature;
}

export function filterVisiblePodcastEpisodes(
  episodes: HiddenTunesPodcastEpisode[],
  options?: { showIsMature?: boolean }
) {
  if (options?.showIsMature && !shouldIncludeMatureInApi()) {
    return [];
  }

  if (shouldIncludeMatureInApi()) return episodes;
  return episodes.filter((episode) => !isMatureContentItem(episode));
}

export function enrichEpisodesWithShowMaturity(
  episodes: HiddenTunesPodcastEpisode[],
  showIsMature: boolean
) {
  if (!showIsMature) return episodes;

  return episodes.map((episode) => {
    if (isMatureContentItem(episode)) return episode;

    return {
      ...episode,
      is_mature: true,
      content_rating:
        episode.content_rating && episode.content_rating !== "clean"
          ? episode.content_rating
          : "adult",
    };
  });
}
