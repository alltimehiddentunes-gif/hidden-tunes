import { MEDIA_DISCOVERY_PAGE_SIZE } from "./mediaDiscovery";

/** Mobile page sizes — discovery lists load 40 at a time. */
export const RADIO_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;
export const PODCAST_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;

/** Max search alias / fallback queries per user search (page 1). */
export const MAX_FALLBACK_QUERIES = 2;

/** Max concurrent discovery network calls (category/rail fetches). */
export const MAX_PARALLEL_DISCOVERY_REQUESTS = 1;

/** When false, mature category tiles render from catalog metadata without probe storms. */
export const MATURE_CATEGORY_PREFETCH = false;

/** Priority rails loaded on first paint (per hub/home). */
export const DISCOVERY_PRIORITY_RAIL_LIMIT = 2;

/** Additional rails loaded after idle or scroll. */
export const DISCOVERY_IDLE_RAIL_LIMIT = 2;

/** Mature category page: primary keyword queries per virtual page. */
export const MATURE_PRIMARY_QUERIES_PER_PAGE = 1;

/** Mature category page: optional fallback keyword when primary is sparse. */
export const MATURE_MAX_FALLBACK_QUERIES_PER_PAGE = 1;

/** Minimum primary results before issuing the single fallback keyword query. */
export const MATURE_FALLBACK_TRIGGER_COUNT = 20;

/** Cap service-layer quality scoring input (post-fetch, pre-rank). */
export const DISCOVERY_QUALITY_RANK_CAP = PODCAST_PAGE_SIZE * 2;

/** Ms between sequential discovery lane fetches. */
export const DISCOVERY_LANE_STAGGER_MS = 150;

/** Ms idle delay before loading deferred hub rails. */
export const DISCOVERY_DEFER_RAIL_IDLE_MS = 400;

/** Ms idle delay before loading mature live radio rail. */
export const DISCOVERY_DEFER_RADIO_IDLE_MS = 800;

/** Re-export for mature foundation alignment. */
export const MATURE_KEYWORDS_PER_FETCH = MATURE_PRIMARY_QUERIES_PER_PAGE;
