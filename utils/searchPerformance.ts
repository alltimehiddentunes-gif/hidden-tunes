/** Shared search timing — music stays responsive; media defers until pause. */

export {
  SEARCH_COLD_START_FIRST_TIMEOUT_MS,
  SEARCH_COLD_START_MAX_ATTEMPTS,
  SEARCH_COLD_START_RETRY_DELAY_MS,
  SEARCH_COLD_START_RETRY_TIMEOUT_MS,
  searchAttemptTimeoutMs,
  shouldCacheBackendSearchResult,
  shouldShowGenuineZeroMatches,
} from "./searchColdStartPolicy";

/** Main search backend (music-first) debounce after submit. */
export const SEARCH_BACKEND_DEBOUNCE_MS = 300;

/** Free-music provider fallback — only when internal catalog is empty. */
export const SEARCH_EXTERNAL_DEBOUNCE_MS = 650;

/** Radio sections in main search — wait for typing pause. */
export const SEARCH_MEDIA_DEFER_MS = 900;

/** Radio station search debounce. */
export const RADIO_SEARCH_DEBOUNCE_MS = 480;

/** Home discovery: ms between featured and secondary lane fetches. */
export const HOME_LANE_STAGGER_MS = 150;

export {
  RADIO_PAGE_SIZE,
  MAX_FALLBACK_QUERIES,
  MAX_PARALLEL_DISCOVERY_REQUESTS,
  MATURE_CATEGORY_PREFETCH,
  DISCOVERY_PRIORITY_RAIL_LIMIT,
  DISCOVERY_IDLE_RAIL_LIMIT,
  DISCOVERY_LANE_STAGGER_MS,
  DISCOVERY_DEFER_RAIL_IDLE_MS,
  DISCOVERY_DEFER_RADIO_IDLE_MS,
} from "../constants/discoveryPerformanceBudget";
