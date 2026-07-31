/** Shared Sports TV catalog constants (safe for Node verification scripts). */
export const SPORTS_TV_CATEGORY = "Sports";
/**
 * First-page size for Live Sports TV.
 * Validated in the 12–24 band: 16 balances first paint vs useful shelf density
 * without prefetching the 576-channel catalogue.
 */
export const SPORTS_TV_PAGE_LIMIT = 16;
/** Hard cap on retained Sports TV pages in the home shelf hook. */
export const SPORTS_TV_MAX_PAGES_IN_MEMORY = 3;
