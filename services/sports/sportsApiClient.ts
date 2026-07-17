/**
 * Back-compat Sports API surface — delegates to sportsCatalogApi.
 */
export {
  SPORTS_CATALOG_BASE_URL,
  SPORTS_DEFAULT_PAGE_LIMIT,
  fetchSportsHome,
  fetchSportsVideos,
  resolveSportsBroadcastPlayback,
  resolveSportsVideoPlayback,
} from "../sportsCatalogApi";
