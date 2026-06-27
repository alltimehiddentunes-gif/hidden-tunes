import { MEDIA_DISCOVERY_PAGE_SIZE } from "./mediaDiscovery";
import {
  MATURE_KEYWORDS_PER_FETCH,
  MATURE_PRIMARY_QUERIES_PER_PAGE,
} from "./discoveryPerformanceBudget";

/** Realistic mature radio station target after quality filtering. */
export const MATURE_RADIO_CATALOG_TARGET_MIN = 500;
export const MATURE_RADIO_CATALOG_TARGET_MAX = 2_000;

/** Mobile page size — unchanged from standard discovery. */
export const MATURE_DISCOVERY_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;

/** Keywords queried per virtual page (rotated batch, not all at once). */
export { MATURE_KEYWORDS_PER_FETCH, MATURE_PRIMARY_QUERIES_PER_PAGE };

/** Minimum items before a mature hub rail is shown. */
export const MATURE_MIN_HUB_RAIL_ITEMS = 10;

/** Mature radio stations required before headline placement. */
export const MATURE_RADIO_HEADLINE_MIN_STATIONS = 10;

/** Minimum quality_score for mature radio surfacing. */
export const MATURE_RADIO_MIN_QUALITY = 28;

/**
 * Safety cap on virtual pages per category/search session.
 * Prevents runaway pagination; 500 pages × 40 = 20k max theoretical exposure.
 */
export const MATURE_MAX_VIRTUAL_PAGES = 500;

/** Minimum playable stations before a mature radio category is shown on its own. */
export const MATURE_RADIO_MIN_CATEGORY_STATIONS = 5;
