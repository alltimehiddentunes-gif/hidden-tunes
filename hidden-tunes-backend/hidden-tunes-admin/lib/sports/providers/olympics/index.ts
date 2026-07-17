export {
  OLYMPICS_PROVIDER_SLUG,
  OLYMPICS_YOUTUBE_CHANNEL_ID,
  OLYMPICS_YOUTUBE_HANDLE,
  OLYMPICS_ALLOWED_HOSTS,
} from "./types";
export type {
  OlympicsVideoRecord,
  OlympicsRightsClassification,
  OlympicsPlaybackMode,
} from "./types";
export { OLYMPICS_FIXTURE_VIDEOS } from "./fixtures";
export {
  discoverOlympicsVideos,
  buildOlympicsEmbedUrl,
  buildOlympicsWatchUrl,
  isOlympicsAllowedHost,
} from "./client";
export { evaluateOlympicsVideoRights } from "./rights";
export {
  getOlympicsTerritoryRules,
  getOlympicsTerritoryMode,
  evaluateOlympicsTerritoryForBrowse,
} from "./territories";
export {
  mapOlympicsVideoToCanonical,
  mapOlympicsVideos,
  formatOlympicsDisplayTitle,
} from "./mapper";
export { OlympicsProviderAdapter, createOlympicsAdapter } from "./adapter";
