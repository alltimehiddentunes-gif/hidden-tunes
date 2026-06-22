import { MEDIA_DISCOVERY_PAGE_SIZE } from "./mediaDiscovery";

/** Long-term catalog target — never loaded on device in bulk. */
export const MATURE_PODCAST_CATALOG_TARGET = 20_000;

/** Realistic mature radio station target after quality filtering. */
export const MATURE_RADIO_CATALOG_TARGET_MIN = 500;
export const MATURE_RADIO_CATALOG_TARGET_MAX = 2_000;

/** Mobile page size — unchanged from standard discovery. */
export const MATURE_DISCOVERY_PAGE_SIZE = MEDIA_DISCOVERY_PAGE_SIZE;

/** Keywords queried in parallel per virtual page (multi-source expansion). */
export const MATURE_KEYWORDS_PER_FETCH = 3;

/** Minimum quality_score for mature podcast surfacing. */
export const MATURE_PODCAST_MIN_QUALITY = 25;

/** Minimum quality_score for mature radio surfacing. */
export const MATURE_RADIO_MIN_QUALITY = 28;

/**
 * Safety cap on virtual pages per category/search session.
 * Prevents runaway pagination; 500 pages × 40 = 20k max theoretical exposure.
 */
export const MATURE_MAX_VIRTUAL_PAGES = 500;

/** Max days since last publish before demoting abandoned shows. */
export const MATURE_ABANDONED_PODCAST_DAYS = 540;
