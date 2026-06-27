export const PODCAST_MAX_SEARCH_RESULTS = 25;
export const PODCAST_MAX_EPISODES_PER_SHOW = 10;
export const PODCAST_EPISODE_FETCH_TIMEOUT_MS = 5000;
export const PODCAST_MAX_QUEUE_EPISODES = 10;
export const PODCAST_MAX_RELATED_SHOWS = 5;
export const PODCAST_SEARCH_DEBOUNCE_MS = 300;

export const MATURE_PODCAST_SHOW_ID_PREFIX = "mature-";

export function isMatureSeedShowId(showId?: string | null) {
  return String(showId || "")
    .trim()
    .toLowerCase()
    .startsWith(MATURE_PODCAST_SHOW_ID_PREFIX);
}
