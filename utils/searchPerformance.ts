/** Shared search timing — music stays responsive; media defers until pause. */

/** Main search backend (music-first) debounce after submit. */
export const SEARCH_BACKEND_DEBOUNCE_MS = 300;

/** Free-music provider fallback — only when internal catalog is empty. */
export const SEARCH_EXTERNAL_DEBOUNCE_MS = 650;

/** Podcast/radio sections in main search — wait for typing pause. */
export const SEARCH_MEDIA_DEFER_MS = 900;

/** Stagger radio after podcast in main search. */
export const SEARCH_MEDIA_SECONDARY_DEFER_MS = 220;

/** Podcast home search debounce. */
export const PODCAST_SEARCH_DEBOUNCE_MS = 480;

/** Radio station search debounce. */
export const RADIO_SEARCH_DEBOUNCE_MS = 480;

/** Max podcast search alias attempts per query (page 1). */
export const PODCAST_SEARCH_MAX_FALLBACK_QUERIES = 2;

/** Home discovery: ms between featured and secondary lane fetches. */
export const HOME_LANE_STAGGER_MS = 150;

export {
  RADIO_PAGE_SIZE,
  PODCAST_PAGE_SIZE,
  MAX_FALLBACK_QUERIES,
  MAX_PARALLEL_DISCOVERY_REQUESTS,
  MATURE_CATEGORY_PREFETCH,
  DISCOVERY_PRIORITY_RAIL_LIMIT,
  DISCOVERY_IDLE_RAIL_LIMIT,
  DISCOVERY_LANE_STAGGER_MS,
  DISCOVERY_DEFER_RAIL_IDLE_MS,
  DISCOVERY_DEFER_RADIO_IDLE_MS,
} from "../constants/discoveryPerformanceBudget";
