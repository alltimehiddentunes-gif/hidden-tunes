export {
  SCOREBAT_PROVIDER_SLUG,
  SCOREBAT_PROVIDER_NAME,
  getScoreBatRuntimeConfig,
  hasScoreBatToken,
  scoreBatTokenPresentLabel,
} from "./config";
export { discoverScoreBatMatches } from "./client";
export { mapScoreBatMatchToCanonical, mapScoreBatMatches } from "./mapper";
export {
  validateScoreBatEmbed,
  extractEmbedSrc,
  isAllowedScoreBatEmbedHost,
} from "./embedSafety";
export {
  normalizeFootballName,
  competitionSlugFromName,
  parseHomeAwayFromTitle,
} from "./normalize";
export {
  classifyScoreBatLifecycle,
  classifyScoreBatVideoTitle,
  scoreBatPollIntervalSeconds,
  shouldHibernateScoreBat,
} from "./lifecycle";
export { matchScoreBatToExistingFixtures } from "./matching";
export { resolveScoreBatPlayback } from "./playback";
export {
  getScoreBatHealth,
  resetScoreBatHealth,
  recordScoreBatDiscoverySuccess,
  recordScoreBatDiscoveryFailure,
  isScoreBatDiscoveryPaused,
  recordScoreBatPlayback,
} from "./health";
export { SCOREBAT_FIXTURE_MATCHES } from "./fixtures";
export { ScoreBatProviderAdapter, createScoreBatAdapter } from "./adapter";
export {
  assessScoreBatEntitlement,
  createScoreBatVideoProvider,
  registerScoreBatPilotAsset,
} from "./videoProvider";
